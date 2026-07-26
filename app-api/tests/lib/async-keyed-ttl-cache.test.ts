import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAsyncKeyedTtlCache } from "@/lib/async-ttl-cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("createAsyncKeyedTtlCache", () => {
  it("keeps independent cached values per key", async () => {
    const loader = vi.fn(async (key: string) => `${key}-value`);
    const cache = createAsyncKeyedTtlCache(loader, 5_000);

    await expect(cache.get("tenant-a")).resolves.toBe("tenant-a-value");
    await expect(cache.get("tenant-b")).resolves.toBe("tenant-b-value");
    await expect(cache.get("tenant-a")).resolves.toBe("tenant-a-value");

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenNthCalledWith(1, "tenant-a");
    expect(loader).toHaveBeenNthCalledWith(2, "tenant-b");
  });

  it("deduplicates concurrent misses for the same key only", async () => {
    const resolvers = new Map<string, (value: string) => void>();
    const loader = vi.fn(
      (key: string) =>
        new Promise<string>((resolve) => {
          resolvers.set(key, resolve);
        }),
    );
    const cache = createAsyncKeyedTtlCache(loader, 5_000);

    const a1 = cache.get("tenant-a");
    const a2 = cache.get("tenant-a");
    const b1 = cache.get("tenant-b");

    expect(loader).toHaveBeenCalledTimes(2);

    resolvers.get("tenant-a")?.("a");
    resolvers.get("tenant-b")?.("b");

    await expect(Promise.all([a1, a2, b1])).resolves.toEqual(["a", "a", "b"]);
  });

  it("can invalidate one key without evicting other scopes", async () => {
    const loader = vi
      .fn(async (key: string) => `${key}-${loader.mock.calls.length}`);
    const cache = createAsyncKeyedTtlCache(loader, 5_000);

    const firstA = await cache.get("tenant-a");
    const firstB = await cache.get("tenant-b");
    cache.invalidate("tenant-a");
    const secondA = await cache.get("tenant-a");
    const secondB = await cache.get("tenant-b");

    expect(secondA).not.toBe(firstA);
    expect(secondB).toBe(firstB);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("invalidates every key when no key is supplied", async () => {
    const loader = vi.fn(async (key: string) => `${key}-${Date.now()}`);
    const cache = createAsyncKeyedTtlCache(loader, 5_000);

    await cache.get("tenant-a");
    await cache.get("tenant-b");
    cache.invalidate();
    vi.advanceTimersByTime(1);
    await cache.get("tenant-a");
    await cache.get("tenant-b");

    expect(loader).toHaveBeenCalledTimes(4);
  });
});
