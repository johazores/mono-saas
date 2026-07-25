import crypto from "node:crypto";
import type {
  TenantRequestInput,
  TenantResolutionCandidate,
  TenantResolutionConfig,
} from "@/types";

const DEFAULT_PATH_PREFIX = "/t";
const DEFAULT_TRUSTED_HEADER = "x-internal-tenant-key";
const DEFAULT_TIMESTAMP_HEADER = "x-internal-tenant-timestamp";
const DEFAULT_SIGNATURE_HEADER = "x-internal-tenant-signature";
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 60;
const MIN_TRUSTED_HEADER_SECRET_LENGTH = 32;
const TENANT_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function firstHeaderValue(
  headers: TenantRequestInput["headers"],
  name: string,
): string | undefined {
  const expected = name.toLowerCase();
  for (const [headerName, rawValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== expected) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return value?.trim() || undefined;
  }
  return undefined;
}

function normalizeHost(rawHost: string | undefined): string | null {
  if (!rawHost) return null;

  const trimmed = rawHost.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(`http://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

function normalizeDomain(rawDomain: string | undefined): string {
  const domain = normalizeHost(rawDomain);
  if (!domain) {
    throw new Error("Tenant resolution baseDomain must be a valid hostname.");
  }
  return domain;
}

function normalizeTenantKey(rawKey: string | undefined): string | null {
  if (!rawKey) return null;
  const key = rawKey.trim().toLowerCase();
  if (!TENANT_KEY_PATTERN.test(key)) return null;
  return key;
}

function resolveSubdomain(
  config: TenantResolutionConfig,
  input: TenantRequestInput,
): TenantResolutionCandidate | null {
  const baseDomain = normalizeDomain(config.baseDomain);
  const host = normalizeHost(input.host);
  if (!host || host === baseDomain) return null;

  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return null;

  const candidate = host.slice(0, -suffix.length);
  // Use exactly one tenant label. Nested subdomains such as foo.bar.example.com
  // are not silently interpreted as tenant identifiers.
  if (!candidate || candidate.includes(".")) return null;

  const key = normalizeTenantKey(candidate);
  return key ? { key, source: "subdomain" } : null;
}

function resolveCustomDomain(
  input: TenantRequestInput,
): TenantResolutionCandidate | null {
  const host = normalizeHost(input.host);
  if (!host) return null;

  // Custom-domain candidates are hostnames, not tenant IDs. T-305 maps the
  // normalized hostname to a verified tenant-domain record.
  return { key: host, source: "custom-domain" };
}

function normalizePathPrefix(rawPrefix: string | undefined): string {
  const raw = rawPrefix?.trim() || DEFAULT_PATH_PREFIX;
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/+$/, "");
  if (!normalized || normalized === "/" || normalized.includes("?") || normalized.includes("#")) {
    throw new Error("Tenant path prefix must be a non-root URL path prefix.");
  }
  return normalized;
}

function resolvePathPrefix(
  config: TenantResolutionConfig,
  input: TenantRequestInput,
): TenantResolutionCandidate | null {
  if (!input.path) return null;

  const prefix = normalizePathPrefix(config.pathPrefix);
  const path = input.path.split("?", 1)[0] || "/";
  const expectedStart = `${prefix}/`;
  if (!path.startsWith(expectedStart)) return null;

  const rawSegment = path.slice(expectedStart.length).split("/", 1)[0];
  if (!rawSegment) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    return null;
  }

  const key = normalizeTenantKey(decoded);
  return key ? { key, source: "path" } : null;
}

function normalizeHeaderName(value: string | undefined, fallback: string): string {
  const name = (value?.trim() || fallback).toLowerCase();
  if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
    throw new Error("Tenant trusted-header configuration contains an invalid header name.");
  }
  return name;
}

function normalizeClockSkew(value: number | undefined): number {
  const seconds = value ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 300) {
    throw new Error("Tenant trusted-header maxClockSkewSeconds must be between 1 and 300.");
  }
  return seconds;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function trustedHeaderPayload(
  timestamp: string,
  key: string,
  input: TenantRequestInput,
): string {
  return [
    timestamp,
    key,
    normalizeHost(input.host) ?? "",
    input.path?.split("?", 1)[0] ?? "",
  ].join("\n");
}

export function signTrustedTenantHeader(
  secret: string,
  timestamp: string,
  key: string,
  input: TenantRequestInput,
): string {
  if (secret.length < MIN_TRUSTED_HEADER_SECRET_LENGTH) {
    throw new Error(
      `Tenant trusted-header secret must be at least ${MIN_TRUSTED_HEADER_SECRET_LENGTH} characters.`,
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(trustedHeaderPayload(timestamp, key, input))
    .digest("hex");
}

function resolveTrustedHeader(
  config: TenantResolutionConfig,
  input: TenantRequestInput,
  now: Date,
): TenantResolutionCandidate | null {
  const headerName = normalizeHeaderName(
    config.trustedHeaderName,
    DEFAULT_TRUSTED_HEADER,
  );
  const timestampHeaderName = normalizeHeaderName(
    config.trustedTimestampHeaderName,
    DEFAULT_TIMESTAMP_HEADER,
  );
  const signatureHeaderName = normalizeHeaderName(
    config.trustedSignatureHeaderName,
    DEFAULT_SIGNATURE_HEADER,
  );
  const secret = config.trustedHeaderSecret;
  if (!secret || secret.length < MIN_TRUSTED_HEADER_SECRET_LENGTH) {
    throw new Error(
      `Tenant trusted-header secret must be at least ${MIN_TRUSTED_HEADER_SECRET_LENGTH} characters.`,
    );
  }

  const key = normalizeTenantKey(firstHeaderValue(input.headers, headerName));
  const timestamp = firstHeaderValue(input.headers, timestampHeaderName);
  let signature = firstHeaderValue(input.headers, signatureHeaderName);
  if (!key || !timestamp || !signature) return null;

  if (signature.toLowerCase().startsWith("sha256=")) {
    signature = signature.slice("sha256=".length);
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    return null;
  }

  const maxClockSkewSeconds = normalizeClockSkew(config.maxClockSkewSeconds);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (Math.abs(nowSeconds - timestampSeconds) > maxClockSkewSeconds) {
    return null;
  }

  const expected = signTrustedTenantHeader(
    secret,
    timestamp,
    key,
    input,
  );
  if (!safeEqualHex(signature, expected)) return null;

  return { key, source: "trusted-header" };
}

/**
 * Resolve an untrusted tenant candidate from request shape.
 *
 * This function never returns a database tenant ID. T-305 must map the
 * candidate to an owned tenant/domain/membership record before request scope is
 * allowed to carry `tenantId`.
 */
export function resolveTenantCandidate(
  config: TenantResolutionConfig,
  input: TenantRequestInput,
  now = new Date(),
): TenantResolutionCandidate | null {
  switch (config.mode) {
    case "subdomain":
      return resolveSubdomain(config, input);
    case "custom-domain":
      return resolveCustomDomain(input);
    case "path-prefix":
      return resolvePathPrefix(config, input);
    case "trusted-header":
      return resolveTrustedHeader(config, input, now);
    default: {
      const exhaustive: never = config.mode;
      throw new Error(`Unsupported tenant resolution mode: ${exhaustive}`);
    }
  }
}
