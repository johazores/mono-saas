import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateBootstrapEnv } from "@/lib/bootstrap-env";

const ENV_KEYS = [
  "DATABASE_URL",
  "ADMIN_SESSION_SECRET",
  "USER_SESSION_SECRET",
  "ENCRYPTION_KEY",
  "ENCRYPTION_KEY_VERSION",
  "APP_ENV",
  "TENANT_RESOLUTION_SHARED_SECRET",
  "NODE_ENV",
] as const;

const originalValues = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function setValidEnv(): void {
  process.env.DATABASE_URL = "mongodb://localhost:27017/mono-saas";
  process.env.ADMIN_SESSION_SECRET =
    "admin-session-secret-at-least-32-characters";
  process.env.USER_SESSION_SECRET =
    "user-session-secret-at-least-32-characters";
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  process.env.ENCRYPTION_KEY_VERSION = "1";
  process.env.APP_ENV = "dev";
  process.env.TENANT_RESOLUTION_SHARED_SECRET =
    "tenant-resolution-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
}

beforeEach(() => {
  setValidEnv();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("validateBootstrapEnv", () => {
  it("accepts a complete bootstrap environment", () => {
    expect(() => validateBootstrapEnv()).not.toThrow();
  });

  it("requires the database URL", () => {
    delete process.env.DATABASE_URL;

    expect(() => validateBootstrapEnv()).toThrow(
      "DATABASE_URL must be configured",
    );
  });

  it("reuses administrator and member session-secret validation", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => validateBootstrapEnv()).toThrow(
      "ADMIN_SESSION_SECRET must be set",
    );

    setValidEnv();
    process.env.USER_SESSION_SECRET = "too-short";
    expect(() => validateBootstrapEnv()).toThrow(
      "USER_SESSION_SECRET must be set and at least 32 characters",
    );
  });

  it("requires a valid encryption key in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENCRYPTION_KEY;

    expect(() => validateBootstrapEnv()).toThrow(
      "ENCRYPTION_KEY must be configured in production",
    );

    setValidEnv();
    process.env.NODE_ENV = "production";
    process.env.ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(() => validateBootstrapEnv()).toThrow(
      "ENCRYPTION_KEY must contain exactly 32 bytes",
    );
  });

  it("allows development startup without encryption until secret settings are used", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENCRYPTION_KEY;

    expect(() => validateBootstrapEnv()).not.toThrow();
  });

  it("rejects invalid APP_ENV values", () => {
    process.env.APP_ENV = "staging";

    expect(() => validateBootstrapEnv()).toThrow("Invalid APP_ENV");
  });

  it("rejects a short tenant-resolution shared secret", () => {
    process.env.TENANT_RESOLUTION_SHARED_SECRET = "too-short";

    expect(() => validateBootstrapEnv()).toThrow(
      "TENANT_RESOLUTION_SHARED_SECRET must be at least 32 characters",
    );
  });

  it("allows the tenant-resolution secret to be absent when that strategy is unused", () => {
    delete process.env.TENANT_RESOLUTION_SHARED_SECRET;

    expect(() => validateBootstrapEnv()).not.toThrow();
  });
});
