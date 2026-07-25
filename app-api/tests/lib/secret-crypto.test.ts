import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSettingValue,
  encryptSettingValue,
  isEncryptedSettingValue,
} from "@/lib/secret-crypto";

const KEY_V1 = Buffer.alloc(32, 1).toString("base64");
const KEY_V2 = Buffer.alloc(32, 2).toString("base64");

beforeEach(() => {
  process.env.ENCRYPTION_KEY = KEY_V1;
  process.env.ENCRYPTION_KEY_VERSION = "1";
  delete process.env.ENCRYPTION_KEY_V1;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_VERSION;
  delete process.env.ENCRYPTION_KEY_V1;
});

describe("secret settings encryption", () => {
  it("round-trips structured values", () => {
    const encrypted = encryptSettingValue({ token: "secret", enabled: true });

    expect(isEncryptedSettingValue(encrypted)).toBe(true);
    expect(encrypted.ciphertext).not.toContain("secret");
    expect(decryptSettingValue(encrypted)).toEqual({
      token: "secret",
      enabled: true,
    });
  });

  it("rejects a tampered authentication tag", () => {
    const encrypted = encryptSettingValue("secret");
    const tampered = {
      ...encrypted,
      authTag: Buffer.alloc(16, 9).toString("base64"),
    };

    expect(() => decryptSettingValue(tampered)).toThrow();
  });

  it("decrypts an older key version during rotation", () => {
    const encrypted = encryptSettingValue("old-secret");

    process.env.ENCRYPTION_KEY_VERSION = "2";
    process.env.ENCRYPTION_KEY = KEY_V2;
    process.env.ENCRYPTION_KEY_V1 = KEY_V1;

    expect(decryptSettingValue(encrypted)).toBe("old-secret");
  });

  it("leaves legacy plaintext values readable for migration", () => {
    expect(decryptSettingValue("legacy-secret")).toBe("legacy-secret");
  });
});
