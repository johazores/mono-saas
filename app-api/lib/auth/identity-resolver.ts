import type { User } from "@prisma/client";
import { getAppEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
} from "@/lib/tenant-membership";
import { invitationRepository } from "@/repositories/invitation-repository";
import { settingService } from "@/services/setting-service";
import type { AuthProviderInterface, VerifiedIdentity } from "./types";

export type ResolvedAuthUser = Pick<
  User,
  "id" | "name" | "email" | "status" | "parentId"
>;

export type IdentityResolver = (
  identity: VerifiedIdentity,
  provider: AuthProviderInterface,
) => Promise<ResolvedAuthUser | null>;

function readLocalUserClaim(value: unknown): ResolvedAuthUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const user = value as Record<string, unknown>;

  if (
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.status !== "string" ||
    !(typeof user.parentId === "string" || user.parentId === null)
  ) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    parentId: user.parentId,
  };
}

/** Credentials verification already loaded the session's local user. */
export const resolveCredentialsIdentity: IdentityResolver = async (identity) => {
  const localUser = readLocalUserClaim(identity.claims.localUser);
  if (!localUser || localUser.id !== identity.subject) return null;
  if (!(await hasActiveCurrentTenantMembership(localUser.id))) return null;
  return localUser;
};

/**
 * Temporary Clerk linkage against the current `User.clerkId` schema.
 *
 * T-305 replaces this compatibility resolver with the provider-neutral
 * `ExternalIdentity(provider, subject)` relation accepted in ADR-003.
 */
export const resolveLegacyClerkIdentity: IdentityResolver = async (
  identity,
  provider,
) => {
  const env = await getAppEnv();

  // Returning linked users stay entirely local on the hot path, but a verified
  // request tenant still requires an existing active organization membership.
  let user = await prisma.user.findFirst({
    where: { env, clerkId: identity.subject },
  });
  if (user) {
    return (await hasActiveCurrentTenantMembership(user.id)) ? user : null;
  }

  let email = identity.email;
  let name = identity.name;

  if (!email && provider.getProfile) {
    const profile = await provider.getProfile(identity.subject);
    email = profile?.email;
    name = name || profile?.name;
  }
  if (!email) return null;

  email = email.toLowerCase().trim();

  // Link an eligible existing local account only when it already belongs to
  // the resolved tenant. Selecting another tenant must never auto-join a user.
  user = await prisma.user.findUnique({
    where: { env_email: { env, email } },
  });

  if (user) {
    if (!(await hasActiveCurrentTenantMembership(user.id))) return null;
    if (user.clerkId && user.clerkId !== identity.subject) return null;
    if (!user.clerkId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: identity.subject },
      });
    }
    return user;
  }

  const [security, invitation] = await Promise.all([
    settingService.getClerkSecurityConfig(),
    invitationRepository.findPendingByEmail(email),
  ]);

  if (!security.openSignup && !invitation) return null;

  // Validate the destination workspace before creating a tenant-staged user.
  const workspace = await resolveCurrentTenantWorkspace();
  let created = false;

  try {
    user = await prisma.user.create({
      data: {
        email,
        clerkId: identity.subject,
        name: name || email,
        passwordHash: "",
        status: "active",
      },
    });
    created = true;
  } catch {
    // Handle simultaneous first requests without creating duplicate users.
    user = await prisma.user.findUnique({
      where: { env_email: { env, email } },
    });
    if (!user || (user.clerkId && user.clerkId !== identity.subject)) {
      return null;
    }
    if (!(await hasActiveCurrentTenantMembership(user.id))) return null;
    if (!user.clerkId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: identity.subject },
      });
    }
  }

  if (created) {
    await provisionNewUserTenantMembership(user.id, workspace);
  }

  if (invitation) {
    await invitationRepository.updateStatus(invitation.id, "accepted");
  }

  return user;
};
