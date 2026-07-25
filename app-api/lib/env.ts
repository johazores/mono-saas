import { basePrisma } from "./base-prisma";
import { getRequestScope } from "./request-scope";

export type AppEnv = "dev" | "production";

const VALID_ENVS: AppEnv[] = ["dev", "production"];

/**
 * How long (ms) the cached DB value is considered fresh.
 * Default 50ms reduces repeated global configuration reads.
 *
 * This cache is deployment-wide only. Request code should resolve APP_ENV once
 * at the API boundary and then read the immutable AsyncLocalStorage snapshot.
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
 * Resolve the active deployment environment.
 *
 * Inside an API request, use the request-local immutable snapshot established by
 * `withRequestScope()`. Outside a request (startup, scripts, migrations), read
 * the global SystemConfig value and fall back to process.env.APP_ENV.
 */
export async function getAppEnv(): Promise<AppEnv> {
  const requestEnv = getRequestScope()?.env;
  if (requestEnv) return validate(requestEnv);

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

/** Force-clear deployment fallback cache after global APP_ENV changes. */
export function invalidateAppEnvCache(): void {
  cachedEnv = null;
  cacheExpiry = 0;
  inflight = null;
}
