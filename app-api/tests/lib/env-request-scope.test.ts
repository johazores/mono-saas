import { beforeEach, describe, expect, it, vi } from "vitest";
import { basePrisma } from "@/lib/base-prisma";
import { getAppEnv, invalidateAppEnvCache } from "@/lib/env";
import { runWithRequestScope } from "@/lib/request-scope";

beforeEach(() => {
  invalidateAppEnvCache();
  vi.restoreAllMocks();
});

describe("getAppEnv request context", () => {
  it("returns request-local env without reading global SystemConfig", async () => {
    const lookup = vi
      .spyOn(basePrisma.systemConfig, "findUnique")
      .mockRejectedValue(new Error("global lookup should not run"));

    const env = await runWithRequestScope(
      {
        requestId: "request-env",
        env: "production",
        source: "deployment",
      },
      () => getAppEnv(),
    );

    expect(env).toBe("production");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps different environment snapshots isolated concurrently", async () => {
    const a = runWithRequestScope(
      {
        requestId: "request-a",
        env: "dev",
        source: "deployment",
      },
      async () => {
        await Promise.resolve();
        return getAppEnv();
      },
    );

    const b = runWithRequestScope(
      {
        requestId: "request-b",
        env: "production",
        source: "deployment",
      },
      async () => {
        await Promise.resolve();
        return getAppEnv();
      },
    );

    await expect(Promise.all([a, b])).resolves.toEqual(["dev", "production"]);
  });
});
