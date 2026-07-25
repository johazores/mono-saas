import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export type EncryptedSettingValue = {
  encrypted: true;
  algorithm: typeof ALGORITHM;
  keyVersion: number;
  iv: string;
  authTag: string;
  ciphertext: string;
};

function parseEncryptionKey(raw: string | undefined, variableName: string): Buffer {
  if (!raw) {
    throw new Error(`${variableName} must be configured.`);
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      `${variableName} must contain exactly 32 bytes as base64 or 64 hexadecimal characters.`,
    );
  }

  return key;
}

function getCurrentKeyVersion(): number {
  const raw = process.env.ENCRYPTION_KEY_VERSION ?? "1";
  const version = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("ENCRYPTION_KEY_VERSION must be a positive integer.");
  }
  return version;
}

function getEncryptionKey(version: number): Buffer {
  const currentVersion = getCurrentKeyVersion();
  if (version === currentVersion) {
    return parseEncryptionKey(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
  }

  const legacyName = `ENCRYPTION_KEY_V${version}`;
  return parseEncryptionKey(process.env[legacyName], legacyName);
}

function additionalData(version: number): Buffer {
  return Buffer.from(`mono-saas:setting:${ALGORITHM}:v${version}`, "utf8");
}

export function isEncryptedSettingValue(
  value: unknown,
): value is EncryptedSettingValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<EncryptedSettingValue>;
  return (
    candidate.encrypted === true &&
    candidate.algorithm === ALGORITHM &&
    typeof candidate.keyVersion === "number" &&
    typeof candidate.iv === "string" &&
    typeof candidate.authTag === "string" &&
    typeof candidate.ciphertext === "string"
  );
}

export function encryptSettingValue(value: unknown): EncryptedSettingValue {
  const keyVersion = getCurrentKeyVersion();
  const key = getEncryptionKey(keyVersion);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(additionalData(keyVersion));

  const plaintext = JSON.stringify(value ?? null);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    encrypted: true,
    algorithm: ALGORITHM,
    keyVersion,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSettingValue(value: unknown): unknown {
  if (!isEncryptedSettingValue(value)) return value;

  const key = getEncryptionKey(value.keyVersion);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(additionalData(value.keyVersion));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as unknown;
}
