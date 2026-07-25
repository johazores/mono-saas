import { getAppEnvSync } from "@/lib/env";
import { getEncryptionKeyring } from "@/lib/secret-encryption";
import {
  getSessionSecret,
  getUserSessionSecret,
} from "@/lib/secure-credentials";
import { serverLogger } from "@/lib/server-logger";

function requireNonEmpty(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function validatePositiveVersion(name: string): void {
  const raw = process.env[name];
  if (!raw) return;

  const version = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(version) || version <= 0 || String(version) !== raw) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function validateClientOrigin(): void {
  const raw = process.env.CLIENT_ORIGIN?.trim();
  if (!raw) return;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("CLIENT_ORIGIN must be a valid URL origin.");
  }

  if (parsed.origin !== raw.replace(/\/$/, "")) {
    throw new Error("CLIENT_ORIGIN must be an origin without a path.");
  }
}

/**
 * Validate only bootstrap configuration that must exist before database-backed
 * runtime settings can be read safely. Provider keys stay in SiteSetting.
 */
export function validateBootstrapEnv(): void {
  requireNonEmpty("DATABASE_URL");
  getSessionSecret();
  getUserSessionSecret();
  getAppEnvSync();
  validateClientOrigin();
  validatePositiveVersion("ENCRYPTION_KEY_VERSION");
  validatePositiveVersion("ENCRYPTION_KEY_VERSION_PREVIOUS");

  const hasCurrentEncryptionKey = Boolean(process.env.ENCRYPTION_KEY?.trim());
  const hasPreviousEncryptionKey = Boolean(
    process.env.ENCRYPTION_KEY_PREVIOUS?.trim(),
  );

  if (process.env.NODE_ENV === "production" && !hasCurrentEncryptionKey) {
    throw new Error("ENCRYPTION_KEY is required in production.");
  }

  if (hasPreviousEncryptionKey && !hasCurrentEncryptionKey) {
    throw new Error(
      "ENCRYPTION_KEY_PREVIOUS cannot be configured without ENCRYPTION_KEY.",
    );
  }

  if (hasCurrentEncryptionKey) {
    // Reuse the encryption module's exact 32-byte key and version validation.
    getEncryptionKeyring();
  } else {
    serverLogger.warn("bootstrap.encryption_key_missing", {
      message:
        "ENCRYPTION_KEY is not configured; secret-class settings cannot be written in this development process.",
    });
  }
}
