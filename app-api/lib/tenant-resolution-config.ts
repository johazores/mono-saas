import { createAsyncTtlCache } from "@/lib/async-ttl-cache";
import { basePrisma } from "@/lib/base-prisma";
import { resolveTenantCandidate } from "@/lib/tenant-resolution";
import type {
  TenantRequestInput,
  TenantResolutionCandidate,
  TenantResolutionConfig,
  TenantResolutionMode,
} from "@/types";

const SYSTEM_CONFIG_KEY = "TENANT_RESOLUTION";
const TRUSTED_HEADER_SECRET_ENV = "TENANT_RESOLUTION_SHARED_SECRET";
const CONFIG_CACHE_MS = 5_000;
const VALID_MODES: TenantResolutionMode[] = [
  "subdomain",
  "custom-domain",
  "path-prefix",
  "trusted-header",
];

function optionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function optionalInteger(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const candidate = value[key];
  return Number.isSafeInteger(candidate) ? (candidate as number) : undefined;
}

function parseConfig(raw: unknown): TenantResolutionConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("TENANT_RESOLUTION SystemConfig must be a JSON object.");
  }

  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (typeof mode !== "string" || !VALID_MODES.includes(mode as TenantResolutionMode)) {
    throw new Error(
      `TENANT_RESOLUTION mode must be one of: ${VALID_MODES.join(", ")}.`,
    );
  }

  const config: TenantResolutionConfig = {
    mode: mode as TenantResolutionMode,
    baseDomain: optionalString(value, "baseDomain"),
    pathPrefix: optionalString(value, "pathPrefix"),
    trustedHeaderName: optionalString(value, "trustedHeaderName"),
    trustedTimestampHeaderName: optionalString(
      value,
      "trustedTimestampHeaderName",
    ),
    trustedSignatureHeaderName: optionalString(
      value,
      "trustedSignatureHeaderName",
    ),
    maxClockSkewSeconds: optionalInteger(value, "maxClockSkewSeconds"),
  };

  if (config.mode === "trusted-header") {
    config.trustedHeaderSecret = process.env[TRUSTED_HEADER_SECRET_ENV]?.trim();
  }

  return config;
}

async function loadTenantResolutionConfig(): Promise<TenantResolutionConfig | null> {
  const row = await basePrisma.systemConfig.findUnique({
    where: { key: SYSTEM_CONFIG_KEY },
  });
  return row ? parseConfig(row.value) : null;
}

const tenantResolutionConfigCache = createAsyncTtlCache(
  loadTenantResolutionConfig,
  CONFIG_CACHE_MS,
);

/**
 * Global platform configuration is intentionally read through basePrisma here:
 * tenant selection must happen before tenant-scoped Prisma can be used.
 */
export async function getTenantResolutionConfig(): Promise<TenantResolutionConfig | null> {
  return tenantResolutionConfigCache.get();
}

export function invalidateTenantResolutionConfigCache(): void {
  tenantResolutionConfigCache.invalidate();
}

/**
 * Resolve only a request candidate. This value is never a database tenant ID.
 * `resolveAuthoritativeTenant()` is the only request-boundary path that may map
 * the candidate through Tenant/TenantDomain before placing tenantId in scope.
 */
export async function resolveConfiguredTenantCandidate(
  input: TenantRequestInput,
  now = new Date(),
): Promise<TenantResolutionCandidate | null> {
  const config = await getTenantResolutionConfig();
  return config ? resolveTenantCandidate(config, input, now) : null;
}
