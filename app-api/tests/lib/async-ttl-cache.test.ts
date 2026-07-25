import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAsyncTtlCache } from "@/lib/async-ttl-cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-25T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("createAsyncTtlCache", () => {
  it("reuses a value until its TTL expires", async () => {
    const loader = vi.fn().mockResolvedValue({ value: 1 });
    const cache = createAsyncTtlCache(loader, 5_000);

    await expect(cache.get()).resolves.toEqual({ value: 1 });
    await expect(cache.get()).resolves.toEqual({ value: 1 });
    expect(loader).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_001);
    loader.mockResolvedValue({ value: 2 });

    await expect(cache.get()).resolves.toEqual({ value: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent misses", async () => {
    let resolveLoader: ((value: string) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );
    const cache = createAsyncTtlCache(loader, 5_000);

    const first = cache.get();
    const second = cache.get();
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader?.("loaded");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "loaded",
      "loaded",
    ]);
  });

  it("reloads immediately after invalidation", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    const cache = createAsyncTtlCache(loader, 5_000);

    await expect(cache.get()).resolves.toBe("first");
    cache.invalidate();
    await expect(cache.get()).resolves.toBe("second");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not let an older in-flight load restore stale data", async () => {
    let resolveOld: ((value: string) => void) | undefined;
    const loader = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce("fresh");
    const cache = createAsyncTtlCache(loader, 5_000);

    const oldRequest = cache.get();
    cache.invalidate();
    await expect(cache.get()).resolves.toBe("fresh");

    resolveOld?.("stale");
    await expect(oldRequest).resolves.toBe("stale");
    await expect(cache.get()).resolves.toBe("fresh");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejected loads", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("recovered");
    const cache = createAsyncTtlCache(loader, 5_000);

    await expect(cache.get()).rejects.toThrow("temporary");
    await expect(cache.get()).resolves.toBe("recovered");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
