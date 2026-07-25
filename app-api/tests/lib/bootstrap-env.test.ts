import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-logger", () => ({
  serverLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { validateBootstrapEnv } from "@/lib/bootstrap-env";
import { serverLogger } from "@/lib/server-logger";

const logger = vi.mocked(serverLogger);
const ENV_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "USER_SESSION_SECRET",
  "ENCRYPTION_KEY",
  "ENCRYPTION_KEY_VERSION",
  "ENCRYPTION_KEY_PREVIOUS",
  "ENCRYPTION_KEY_VERSION_PREVIOUS",
  "APP_ENV",
  "CLIENT_ORIGIN",
  "NODE_ENV",
] as const;

const originalValues = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function setValidBaseEnv(): void {
  process.env.DATABASE_URL = "mongodb://localhost:27017/mono-saas";
  process.env.SESSION_SECRET = "admin-session-secret-at-least-32-characters";
  process.env.USER_SESSION_SECRET = "user-session-secret-at-least-32-characters";
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  process.env.ENCRYPTION_KEY_VERSION = "1";
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  delete process.env.ENCRYPTION_KEY_VERSION_PREVIOUS;
  process.env.APP_ENV = "dev";
  process.env.CLIENT_ORIGIN = "http://localhost:7000";
  process.env.NODE_ENV = "test";
}

beforeEach(() => {
  vi.clearAllMocks();
  setValidBaseEnv();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("validateBootstrapEnv", () => {
  it("accepts a complete valid bootstrap environment", () => {
    expect(() => validateBootstrapEnv()).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("requires the database and both session secrets", () => {
    delete process.env.DATABASE_URL;
    expect(() => validateBootstrapEnv()).toThrow("DATABASE_URL is required");

    setValidBaseEnv();
    delete process.env.SESSION_SECRET;
    expect(() => validateBootstrapEnv()).toThrow("SESSION_SECRET is not set");

    setValidBaseEnv();
    delete process.env.USER_SESSION_SECRET;
    expect(() => validateBootstrapEnv()).toThrow(
      "USER_SESSION_SECRET is not set",
    );
  });

  it("requires encryption in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENCRYPTION_KEY;

    expect(() => validateBootstrapEnv()).toThrow(
      "ENCRYPTION_KEY is required in production",
    );
  });

  it("warns but allows development startup without encryption", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENCRYPTION_KEY;

    expect(() => validateBootstrapEnv()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      "bootstrap.encryption_key_missing",
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("rejects invalid deployment scope and client origins", () => {
    process.env.APP_ENV = "staging";
    expect(() => validateBootstrapEnv()).toThrow("Invalid APP_ENV");

    setValidBaseEnv();
    process.env.CLIENT_ORIGIN = "https://example.com/app";
    expect(() => validateBootstrapEnv()).toThrow(
      "CLIENT_ORIGIN must be an origin without a path",
    );
  });

  it("validates encryption versions and previous-key pairing", () => {
    process.env.ENCRYPTION_KEY_VERSION = "0";
    expect(() => validateBootstrapEnv()).toThrow(
      "ENCRYPTION_KEY_VERSION must be a positive integer",
    );

    setValidBaseEnv();
    delete process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY_PREVIOUS = "b".repeat(64);
    expect(() => validateBootstrapEnv()).toThrow(
      "ENCRYPTION_KEY_PREVIOUS cannot be configured without ENCRYPTION_KEY",
    );
  });
});
