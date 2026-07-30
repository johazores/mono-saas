import { getAppEnvSync } from "@/lib/env";
import {
  getSessionSecret,
  getUserSessionSecret,
} from "@/lib/session-secrets";
import { validateCurrentEncryptionKeyConfig } from "@/lib/secret-crypto";

const MIN_SHARED_SECRET_LENGTH = 32;

function requireNonEmpty(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function validateTenantResolutionSecret(): void {
  const secret = process.env.TENANT_RESOLUTION_SHARED_SECRET?.trim();
  if (!secret) return;
  if (secret.length < MIN_SHARED_SECRET_LENGTH) {
    throw new Error(
      `TENANT_RESOLUTION_SHARED_SECRET must be at least ${MIN_SHARED_SECRET_LENGTH} characters.`,
    );
  }
}

/**
 * Validate only configuration required before encrypted/database-backed runtime
 * settings can be used safely. Provider credentials and administrator-managed
 * runtime configuration remain SiteSetting values.
 *
 * APP_ENV remains transitional until T-305 replaces environment partitioning
 * with tenantId and separate deployment databases.
 */
export function validateBootstrapEnv(): void {
  requireNonEmpty("DATABASE_URL");
  getSessionSecret();
  getUserSessionSecret();
  getAppEnvSync();
  validateTenantResolutionSecret();

  const hasEncryptionKey = Boolean(process.env.ENCRYPTION_KEY?.trim());
  if (process.env.NODE_ENV === "production" && !hasEncryptionKey) {
    throw new Error("ENCRYPTION_KEY must be configured in production.");
  }

  if (hasEncryptionKey) {
    validateCurrentEncryptionKeyConfig();
  }
}
