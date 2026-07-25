export type AsyncTtlCache<T> = {
  get(): Promise<T>;
  invalidate(): void;
};

/**
 * Small in-process cache for configuration reads.
 *
 * Concurrent misses share one loader promise. Rejections are never cached, and
 * explicit invalidation clears both the value and its expiry immediately.
 */
export function createAsyncTtlCache<T>(
  loader: () => Promise<T>,
  ttlMs: number,
): AsyncTtlCache<T> {
  let value: T | undefined;
  let hasValue = false;
  let expiresAt = 0;
  let inflight: Promise<T> | null = null;

  return {
    async get(): Promise<T> {
      const now = Date.now();
      if (hasValue && now < expiresAt) return value as T;
      if (inflight) return inflight;

      inflight = loader()
        .then((loaded) => {
          value = loaded;
          hasValue = true;
          expiresAt = Date.now() + ttlMs;
          return loaded;
        })
        .finally(() => {
          inflight = null;
        });

      return inflight;
    },

    invalidate(): void {
      value = undefined;
      hasValue = false;
      expiresAt = 0;
      inflight = null;
    },
  };
}
