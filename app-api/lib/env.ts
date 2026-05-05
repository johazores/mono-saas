import { basePrisma } from "./base-prisma";

export type AppEnv = "dev" | "production";

const VALID_ENVS: AppEnv[] = ["dev", "production"];

/**
 * How long (ms) the cached DB value is considered fresh.
 * Default 50ms provides per-request deduplication while staying near real-time.
 * Increase to 5000–30000 for high-traffic production if the extra DB read becomes a concern.
 */
const SYSTEM_CONFIG_CACHE_MS = 50;

let cachedEnv: AppEnv | null = null;
let cacheExpiry = 0;
let inflight: Promise<AppEnv> | null = null;

function validate(raw: string): AppEnv {
  if (!VALID_ENVS.includes(raw as AppEnv)) {
    throw new Error(
      `Invalid APP_ENV "${raw}". Must be one of: ${VALID_ENVS.join(", ")}`,
    );
  }
  return raw as AppEnv;
}

/**
 * Synchronous fallback for build-time contexts (next.config.ts, vitest.config.ts)
 * where async is not available. Reads only from process.env.
 */
export function getAppEnvSync(): AppEnv {
  const raw = process.env.APP_ENV || "dev";
  return validate(raw);
}

/**
 * Async environment resolver. Reads from SystemConfig DB table first,
 * falls back to process.env.APP_ENV if DB value is unavailable.
 * Results are cached for SYSTEM_CONFIG_CACHE_MS to deduplicate within a request.
 */
export async function getAppEnv(): Promise<AppEnv> {
  const now = Date.now();
  if (cachedEnv && now < cacheExpiry) {
    return cachedEnv;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    let raw: string;
    try {
      const row = await basePrisma.systemConfig.findUnique({
        where: { key: "APP_ENV" },
      });
      raw = row ? (row.value as string) : process.env.APP_ENV || "dev";
    } catch {
      // DB unavailable — fall back to process.env
      raw = process.env.APP_ENV || "dev";
    }
    cachedEnv = validate(raw);
    cacheExpiry = Date.now() + SYSTEM_CONFIG_CACHE_MS;
    inflight = null;
    return cachedEnv;
  })();

  return inflight;
}

/** Force-clear the cached value (used after admin updates APP_ENV). */
export function invalidateAppEnvCache(): void {
  cachedEnv = null;
  cacheExpiry = 0;
  inflight = null;
}
