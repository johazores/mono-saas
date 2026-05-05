import crypto from "crypto";
import { getUserSessionSecret } from "@/lib/secure-credentials";
import { settingService } from "@/services/setting-service";
import { userService } from "@/services/user-service";
import { invitationRepository } from "@/repositories/invitation-repository";
import type {
  CreateInvitationInput,
  AcceptInvitationInput,
  InvitationRecord,
} from "@/types";

const INVITATION_DAYS = 7;

function hashToken(token: string): string {
  return crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(token)
    .digest("hex");
}

export const invitationService = {
  async create(
    input: CreateInvitationInput,
    adminId: string,
  ): Promise<{ invitation: InvitationRecord; token?: string }> {
    const email = input.email.toLowerCase().trim();
    if (!email) throw new Error("Email is required.");

    const authConfig = await settingService.getAuthConfig();

    if (authConfig.provider === "clerk") {
      return this.createClerkInvitation(email, input.name, adminId, authConfig);
    }

    return this.createCredentialInvitation(email, input.name, adminId);
  },

  async createClerkInvitation(
    email: string,
    name: string | undefined,
    adminId: string,
    authConfig: { clerkSecretKey: string },
  ): Promise<{ invitation: InvitationRecord; token?: string }> {
    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey: authConfig.clerkSecretKey });

    // Revoke any existing pending Clerk invitations for this email before creating a new one
    try {
      const existing = await clerk.invitations.getInvitationList({ status: "pending" });
      for (const inv of existing.data) {
        if (inv.emailAddress.toLowerCase() === email) {
          await clerk.invitations.revokeInvitation(inv.id);
        }
      }
    } catch {
      // Best-effort cleanup — continue even if this fails
    }

    try {
      await clerk.invitations.createInvitation({
        emailAddress: email,
      });
    } catch (clerkErr: unknown) {
      // Extract detailed error from Clerk SDK
      const ce = clerkErr as { errors?: { longMessage?: string; message?: string }[] };
      const detail = ce.errors?.[0]?.longMessage || ce.errors?.[0]?.message;
      throw new Error(detail || (clerkErr instanceof Error ? clerkErr.message : "Failed to send Clerk invitation."));
    }

    // Store a local tracking record (use a random hash since Clerk manages the token)
    const trackingHash = crypto.randomBytes(32).toString("hex");
    const invitation = await invitationRepository.create({
      email,
      name,
      tokenHash: trackingHash,
      expiresAt: new Date(
        Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000,
      ),
      invitedBy: adminId,
    });

    return { invitation: invitation as unknown as InvitationRecord };
  },

  async createCredentialInvitation(
    email: string,
    name: string | undefined,
    adminId: string,
  ): Promise<{ invitation: InvitationRecord; token: string }> {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);

    const invitation = await invitationRepository.create({
      email,
      name,
      tokenHash,
      expiresAt: new Date(
        Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000,
      ),
      invitedBy: adminId,
    });

    return { invitation: invitation as unknown as InvitationRecord, token };
  },

  async accept(input: AcceptInvitationInput) {
    const { token, password, name } = input;
    if (!token || !password) throw new Error("Token and password are required.");
    if (password.length < 8)
      throw new Error("Password must be at least 8 characters.");

    const tokenHash = hashToken(token);
    const invitation = await invitationRepository.findByTokenHash(tokenHash);

    if (!invitation) throw new Error("Invalid or expired invitation.");
    if (invitation.status !== "pending")
      throw new Error("This invitation has already been used or expired.");
    if (invitation.expiresAt < new Date()) {
      await invitationRepository.updateStatus(invitation.id, "expired");
      throw new Error("This invitation has expired.");
    }

    // Create the user account
    const user = await userService.register({
      name: name || invitation.name || invitation.email.split("@")[0],
      email: invitation.email,
      password,
    });

    if (!user) throw new Error("Failed to create user account.");

    // Mark invitation as accepted
    await invitationRepository.updateStatus(invitation.id, "accepted");

    return user;
  },

  async list(): Promise<InvitationRecord[]> {
    const records = await invitationRepository.list();
    return records as unknown as InvitationRecord[];
  },

  async revoke(id: string) {
    const invitation = await invitationRepository.findById(id);
    if (!invitation) throw new Error("Invitation not found.");
    if (invitation.status !== "pending")
      throw new Error("Only pending invitations can be revoked.");

    // If using Clerk, also revoke the invitation in Clerk
    const authConfig = await settingService.getAuthConfig();
    if (authConfig.provider === "clerk" && authConfig.clerkSecretKey) {
      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerk = createClerkClient({ secretKey: authConfig.clerkSecretKey });
        const existing = await clerk.invitations.getInvitationList({ status: "pending" });
        for (const inv of existing.data) {
          if (inv.emailAddress.toLowerCase() === invitation.email.toLowerCase()) {
            await clerk.invitations.revokeInvitation(inv.id);
          }
        }
      } catch {
        // Best-effort — local revoke still proceeds
      }
    }

    await invitationRepository.updateStatus(id, "expired");
  },
};
