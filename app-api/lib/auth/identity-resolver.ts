import type { User } from "@prisma/client";
import { getAppEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { invitationRepository } from "@/repositories/invitation-repository";
import { settingService } from "@/services/setting-service";
import type { AuthProviderInterface, VerifiedIdentity } from "./types";

export type IdentityResolver = (
  identity: VerifiedIdentity,
  provider: AuthProviderInterface,
) => Promise<User | null>;

/** Credentials subjects are existing local user IDs created by UserSession. */
export const resolveCredentialsIdentity: IdentityResolver = async (identity) => {
  return prisma.user.findUnique({ where: { id: identity.subject } });
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

  // Returning linked users stay entirely local on the hot path.
  let user = await prisma.user.findFirst({
    where: { env, clerkId: identity.subject },
  });
  if (user) return user;

  let email = identity.email;
  let name = identity.name;

  if (!email && provider.getProfile) {
    const profile = await provider.getProfile(identity.subject);
    email = profile?.email;
    name = name || profile?.name;
  }
  if (!email) return null;

  email = email.toLowerCase().trim();

  // Link an eligible existing local account. Never replace another provider
  // subject automatically.
  user = await prisma.user.findUnique({
    where: { env_email: { env, email } },
  });

  if (user) {
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
  } catch {
    // Handle simultaneous first requests without creating duplicate users.
    user = await prisma.user.findUnique({
      where: { env_email: { env, email } },
    });
    if (!user || (user.clerkId && user.clerkId !== identity.subject)) {
      return null;
    }
    if (!user.clerkId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: identity.subject },
      });
    }
  }

  if (invitation) {
    await invitationRepository.updateStatus(invitation.id, "accepted");
  }

  return user;
};
