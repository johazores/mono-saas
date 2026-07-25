import type { NextApiRequest } from "next";
import { settingService } from "@/services/setting-service";
import type { ClerkJwtPayload } from "@/types";

const PROFILE_CACHE_MS = 5 * 60 * 1000;
const PROFILE_CACHE_MAX = 500;

type ClerkProfile = {
  email?: string;
  name?: string;
};

type CachedProfile = {
  value: ClerkProfile;
  expiresAt: number;
};

const profileCache = new Map<string, CachedProfile>();

function stringClaim(
  payload: Record<string, unknown>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function cacheProfile(userId: string, value: ClerkProfile): void {
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldest = profileCache.keys().next().value as string | undefined;
    if (oldest) profileCache.delete(oldest);
  }
  profileCache.set(userId, {
    value,
    expiresAt: Date.now() + PROFILE_CACHE_MS,
  });
}

/**
 * Verify a Clerk JWT from an Authorization header.
 * The `authorizedParties` allowlist is mandatory to prevent tokens minted for
 * another frontend origin from being accepted by this API.
 */
export async function verifyClerkAuthorization(
  authHeader: string | undefined,
): Promise<ClerkJwtPayload | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const [config, security] = await Promise.all([
    settingService.getAuthConfig(),
    settingService.getClerkSecurityConfig(),
  ]);
  if (
    config.provider !== "clerk" ||
    !config.clerkSecretKey ||
    security.authorizedParties.length === 0
  ) {
    return null;
  }

  try {
    const { verifyToken } = await import("@clerk/backend");
    const verified = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
      authorizedParties: security.authorizedParties,
    });
    const payload = verified as unknown as Record<string, unknown>;
    const sub = stringClaim(payload, ["sub"]);
    if (!sub) return null;

    return {
      sub,
      email: stringClaim(payload, [
        "email",
        "primaryEmail",
        "primary_email",
      ]),
      name: stringClaim(payload, ["name", "fullName", "full_name"]),
    };
  } catch {
    return null;
  }
}

/** Compatibility wrapper for existing callers/tests using NextApiRequest. */
export async function verifyClerkToken(
  req: NextApiRequest,
): Promise<ClerkJwtPayload | null> {
  return verifyClerkAuthorization(req.headers.authorization);
}

/**
 * Fetch Clerk profile details only when a new local user must be linked or
 * provisioned and the session token does not contain custom email/name claims.
 * Existing linked users never require this network request.
 */
export async function getClerkUserProfile(
  userId: string,
): Promise<ClerkProfile | null> {
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) profileCache.delete(userId);

  const config = await settingService.getAuthConfig();
  if (config.provider !== "clerk" || !config.clerkSecretKey) return null;

  try {
    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
    const user = await clerk.users.getUser(userId);
    const primaryEmail = user.primaryEmailAddressId
      ? user.emailAddresses.find(
          (address) => address.id === user.primaryEmailAddressId,
        )
      : user.emailAddresses[0];
    const profile = {
      email: primaryEmail?.emailAddress,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    };
    cacheProfile(userId, profile);
    return profile;
  } catch {
    return null;
  }
}
