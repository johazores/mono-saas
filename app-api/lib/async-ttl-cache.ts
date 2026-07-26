export type AsyncTtlCache<T> = {
  get(): Promise<T>;
  invalidate(): void;
};

export type AsyncKeyedTtlCache<K, T> = {
  get(key: K): Promise<T>;
  invalidate(key?: K): void;
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

/**
 * Keyed wrapper around the single-entry cache. Each scope gets independent
 * cached and in-flight state while invalidation can clear one scope or all.
 */
export function createAsyncKeyedTtlCache<K, T>(
  loader: (key: K) => Promise<T>,
  ttlMs: number,
): AsyncKeyedTtlCache<K, T> {
  const caches = new Map<K, AsyncTtlCache<T>>();

  function getCache(key: K): AsyncTtlCache<T> {
    const existing = caches.get(key);
    if (existing) return existing;

    const cache = createAsyncTtlCache(() => loader(key), ttlMs);
    caches.set(key, cache);
    return cache;
  }

  return {
    get(key: K): Promise<T> {
      return getCache(key).get();
    },

    invalidate(key?: K): void {
      if (key !== undefined) {
        caches.get(key)?.invalidate();
        caches.delete(key);
        return;
      }

      for (const cache of caches.values()) cache.invalidate();
      caches.clear();
    },
  };
}
