import crypto from "node:crypto";
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  S3CompatibleStorageConfig,
  S3PresignInput,
  SignedStorageUrl,
  StorageObjectMetadata,
  StorageProviderInterface,
} from "@/types/storage";

const DEFAULT_URL_TTL_SECONDS = 15 * 60;
const INTERNAL_URL_TTL_SECONDS = 60;
const MAX_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";
const TERMINATOR = "aws4_request";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encode).join("/");
}

function normalizeKey(raw: string): string {
  const key = raw.trim().replace(/^\/+/, "");
  if (!key || key.length > 1_024) {
    throw new Error("Storage object key must be between 1 and 1024 characters.");
  }
  if (/\p{C}/u.test(key)) {
    throw new Error("Storage object key contains unsupported control characters.");
  }
  if (key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Storage object key cannot contain dot path segments.");
  }
  return key;
}

function normalizeConfig(
  config: S3CompatibleStorageConfig,
): S3CompatibleStorageConfig {
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error("Storage endpoint must be a valid URL origin.");
  }

  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error("Storage endpoint must use HTTP or HTTPS.");
  }
  if (endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
    throw new Error("Storage endpoint must be an origin without a path or query.");
  }

  const bucket = config.bucket.trim();
  const region = config.region.trim();
  const accessKeyId = config.accessKeyId.trim();
  const secretAccessKey = config.secretAccessKey.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Storage endpoint, region, bucket, and credentials are required.");
  }

  return {
    endpoint: endpoint.origin,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

function normalizeExpires(value: number | undefined): number {
  const seconds = value ?? DEFAULT_URL_TTL_SECONDS;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_URL_TTL_SECONDS
  ) {
    throw new Error(
      `Signed storage URL expiry must be between 1 and ${MAX_URL_TTL_SECONDS} seconds.`,
    );
  }
  return seconds;
}

function formatAmzDate(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQuery(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join("&");
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function safeDownloadName(value: string): string {
  const sanitized = value.replace(/[\r\n"\\]/g, "_").trim().slice(0, 200);
  return sanitized || "download";
}

/**
 * Create an AWS Signature Version 4 presigned URL using path-style object URLs.
 * This shape works for AWS S3 and S3-compatible stores such as Cloudflare R2.
 */
export function presignS3Request(
  rawConfig: S3CompatibleStorageConfig,
  input: S3PresignInput,
  now = new Date(),
): SignedStorageUrl {
  const config = normalizeConfig(rawConfig);
  const key = normalizeKey(input.key);
  const expiresInSeconds = normalizeExpires(input.expiresInSeconds);
  const endpoint = new URL(config.endpoint);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/${TERMINATOR}`;
  const canonicalUri = `/${encode(config.bucket)}/${encodeObjectKey(key)}`;

  const headers: Record<string, string> = { host: endpoint.host };
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers[name.toLowerCase()] = normalizeHeaderValue(value);
  }
  const signedHeaderNames = Object.keys(headers).sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = `${signedHeaderNames
    .map((name) => `${name}:${headers[name]}`)
    .join("\n")}\n`;

  const query: Record<string, string> = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, TERMINATOR);
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  query["X-Amz-Signature"] = signature;

  const responseHeaders = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([name, value]) => [
      name,
      normalizeHeaderValue(value),
    ]),
  );

  return {
    url: `${endpoint.origin}${canonicalUri}?${canonicalQuery(query)}`,
    method: input.method,
    headers: responseHeaders,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1_000),
  };
}

export function createS3CompatibleStorageProvider(
  rawConfig: S3CompatibleStorageConfig,
): StorageProviderInterface {
  const config = normalizeConfig(rawConfig);

  return {
    async createUploadUrl(
      input: CreateUploadUrlInput,
    ): Promise<SignedStorageUrl> {
      const contentType = input.contentType.trim();
      if (!contentType || contentType.length > 255) {
        throw new Error("A valid storage content type is required.");
      }

      return presignS3Request(config, {
        method: "PUT",
        key: input.key,
        expiresInSeconds: normalizeExpires(input.expiresInSeconds),
        headers: { "Content-Type": contentType },
      });
    },

    async createDownloadUrl(
      input: CreateDownloadUrlInput,
    ): Promise<SignedStorageUrl> {
      const query = input.downloadName
        ? {
            "response-content-disposition": `attachment; filename="${safeDownloadName(input.downloadName)}"`,
          }
        : undefined;

      return presignS3Request(config, {
        method: "GET",
        key: input.key,
        expiresInSeconds: normalizeExpires(input.expiresInSeconds),
        query,
      });
    },

    async headObject(key: string): Promise<StorageObjectMetadata | null> {
      const signed = presignS3Request(config, {
        method: "HEAD",
        key,
        expiresInSeconds: INTERNAL_URL_TTL_SECONDS,
      });
      const response = await fetch(signed.url, {
        method: signed.method,
        headers: signed.headers,
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Storage HEAD failed with status ${response.status}.`);
      }

      const sizeBytes = Number.parseInt(
        response.headers.get("content-length") ?? "0",
        10,
      );

      return {
        key: normalizeKey(key),
        sizeBytes: Number.isSafeInteger(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
      };
    },

    async deleteObject(key: string): Promise<void> {
      const signed = presignS3Request(config, {
        method: "DELETE",
        key,
        expiresInSeconds: INTERNAL_URL_TTL_SECONDS,
      });
      const response = await fetch(signed.url, {
        method: signed.method,
        headers: signed.headers,
      });

      if (response.status === 404) return;
      if (!response.ok) {
        throw new Error(`Storage DELETE failed with status ${response.status}.`);
      }
    },
  };
}
