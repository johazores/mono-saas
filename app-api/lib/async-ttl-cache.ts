export type AsyncTtlCache<T> = {
  get(): Promise<T>;
  invalidate(): void;
};

/**
 * Small in-process cache for configuration reads.
 *
 * Concurrent misses share one loader promise. Rejections are never cached.
 * Invalidation advances a generation so an older in-flight load cannot restore
 * stale data after an administrator writes new configuration.
 */
export function createAsyncTtlCache<T>(
  loader: () => Promise<T>,
  ttlMs: number,
): AsyncTtlCache<T> {
  let value: T | undefined;
  let hasValue = false;
  let expiresAt = 0;
  let inflight: Promise<T> | null = null;
  let generation = 0;

  return {
    async get(): Promise<T> {
      const now = Date.now();
      if (hasValue && now < expiresAt) return value as T;
      if (inflight) return inflight;

      const loadGeneration = generation;
      let pending: Promise<T>;
      pending = loader()
        .then((loaded) => {
          if (generation === loadGeneration) {
            value = loaded;
            hasValue = true;
            expiresAt = Date.now() + ttlMs;
          }
          return loaded;
        })
        .finally(() => {
          if (inflight === pending) inflight = null;
        });
      inflight = pending;

      return pending;
    },

    invalidate(): void {
      generation += 1;
      value = undefined;
      hasValue = false;
      expiresAt = 0;
      inflight = null;
    },
  };
}
