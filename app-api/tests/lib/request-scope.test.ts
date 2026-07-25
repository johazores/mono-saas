import { describe, expect, it } from "vitest";
import {
  getRequestId,
  getRequestScope,
  getTenantId,
  requireTenantId,
  runWithRequestScope,
} from "@/lib/request-scope";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("request scope", () => {
  it("isolates concurrent async request contexts", async () => {
    const releaseA = deferred();
    const releaseB = deferred();
    const observed: string[] = [];

    const requestA = runWithRequestScope(
      {
        requestId: "req-a",
        env: "dev",
        tenantId: "tenant-a",
        source: "membership",
      },
      async () => {
        observed.push(`a:start:${requireTenantId()}`);
        await releaseA.promise;
        observed.push(`a:end:${requireTenantId()}:${getRequestId()}`);
      },
    );

    const requestB = runWithRequestScope(
      {
        requestId: "req-b",
        env: "production",
        tenantId: "tenant-b",
        source: "host",
      },
      async () => {
        observed.push(`b:start:${requireTenantId()}`);
        releaseA.resolve();
        await releaseB.promise;
        observed.push(`b:end:${requireTenantId()}:${getRequestId()}`);
      },
    );

    await Promise.resolve();
    releaseB.resolve();
    await Promise.all([requestA, requestB]);

    expect(observed).toContain("a:start:tenant-a");
    expect(observed).toContain("a:end:tenant-a:req-a");
    expect(observed).toContain("b:start:tenant-b");
    expect(observed).toContain("b:end:tenant-b:req-b");
    expect(getRequestScope()).toBeNull();
  });

  it("uses an immutable snapshot instead of the caller object", async () => {
    const input = {
      requestId: "req-original",
      env: "dev" as const,
      tenantId: "tenant-original",
      source: "membership" as const,
    };

    await runWithRequestScope(input, async () => {
      input.requestId = "req-mutated";
      input.tenantId = "tenant-mutated";
      await Promise.resolve();

      expect(getRequestId()).toBe("req-original");
      expect(getTenantId()).toBe("tenant-original");
      expect(Object.isFrozen(getRequestScope())).toBe(true);
    });
  });

  it("restores an outer request scope after a nested scope completes", async () => {
    await runWithRequestScope(
      {
        requestId: "outer",
        tenantId: "tenant-outer",
        source: "membership",
      },
      async () => {
        expect(requireTenantId()).toBe("tenant-outer");

        await runWithRequestScope(
          {
            requestId: "inner",
            tenantId: "tenant-inner",
            source: "platform-admin",
          },
          async () => {
            expect(requireTenantId()).toBe("tenant-inner");
          },
        );

        expect(requireTenantId()).toBe("tenant-outer");
        expect(getRequestId()).toBe("outer");
      },
    );
  });

  it("fails closed when tenant context is required but absent", () => {
    expect(getTenantId()).toBeNull();
    expect(() => requireTenantId()).toThrow("Tenant context is required");
  });
});
