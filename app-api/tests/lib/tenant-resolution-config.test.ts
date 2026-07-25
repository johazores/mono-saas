import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/base-prisma", () => ({
  basePrisma: {
    systemConfig: {
      findUnique: vi.fn(),
    },
  },
}));

import { basePrisma } from "@/lib/base-prisma";
import {
  getTenantResolutionConfig,
  invalidateTenantResolutionConfigCache,
  resolveConfiguredTenantCandidate,
} from "@/lib/tenant-resolution-config";
import { signTrustedTenantHeader } from "@/lib/tenant-resolution";

const findUnique = vi.mocked(basePrisma.systemConfig.findUnique);
const originalSecret = process.env.TENANT_RESOLUTION_SHARED_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  invalidateTenantResolutionConfigCache();
  delete process.env.TENANT_RESOLUTION_SHARED_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TENANT_RESOLUTION_SHARED_SECRET;
  } else {
    process.env.TENANT_RESOLUTION_SHARED_SECRET = originalSecret;
  }
});

describe("tenant resolution configuration", () => {
  it("returns null when no global strategy is configured", async () => {
    findUnique.mockResolvedValue(null);

    await expect(getTenantResolutionConfig()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: "TENANT_RESOLUTION" },
    });
  });

  it("loads public strategy settings from global SystemConfig", async () => {
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: {
        mode: "subdomain",
        baseDomain: "example.com",
      },
      updatedAt: new Date(),
    });

    await expect(getTenantResolutionConfig()).resolves.toEqual({
      mode: "subdomain",
      baseDomain: "example.com",
      pathPrefix: undefined,
      trustedHeaderName: undefined,
      trustedTimestampHeaderName: undefined,
      trustedSignatureHeaderName: undefined,
      maxClockSkewSeconds: undefined,
    });
  });

  it("loads trusted-header secret only from deployment secrets", async () => {
    process.env.TENANT_RESOLUTION_SHARED_SECRET =
      "real-trusted-header-secret-at-least-32-characters";
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: {
        mode: "trusted-header",
        trustedHeaderSecret: "database-value-must-be-ignored",
        maxClockSkewSeconds: 30,
      },
      updatedAt: new Date(),
    });

    const config = await getTenantResolutionConfig();

    expect(config?.mode).toBe("trusted-header");
    expect(config?.trustedHeaderSecret).toBe(
      "real-trusted-header-secret-at-least-32-characters",
    );
    expect(JSON.stringify(config)).not.toContain("database-value-must-be-ignored");
  });

  it("fails closed when the configured mode is unknown", async () => {
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: { mode: "public-header" },
      updatedAt: new Date(),
    });

    await expect(getTenantResolutionConfig()).rejects.toThrow(
      "mode must be one of",
    );
  });

  it("resolves request candidates through the configured strategy", async () => {
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: {
        mode: "subdomain",
        baseDomain: "example.com",
      },
      updatedAt: new Date(),
    });

    await expect(
      resolveConfiguredTenantCandidate({
        host: "acme.example.com",
        path: "/api/users",
        headers: {},
      }),
    ).resolves.toEqual({ key: "acme", source: "subdomain" });
  });

  it("uses the deployment secret for signed trusted-header candidates", async () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const timestamp = String(Math.floor(now.getTime() / 1_000));
    const secret = "real-trusted-header-secret-at-least-32-characters";
    process.env.TENANT_RESOLUTION_SHARED_SECRET = secret;
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: { mode: "trusted-header" },
      updatedAt: new Date(),
    });

    const unsigned = {
      host: "api.internal.example",
      path: "/api/orders",
      headers: {},
    };
    const signature = signTrustedTenantHeader(
      secret,
      timestamp,
      "acme",
      unsigned,
    );

    await expect(
      resolveConfiguredTenantCandidate(
        {
          ...unsigned,
          headers: {
            "x-internal-tenant-key": "acme",
            "x-internal-tenant-timestamp": timestamp,
            "x-internal-tenant-signature": signature,
          },
        },
        now,
      ),
    ).resolves.toEqual({ key: "acme", source: "trusted-header" });
  });

  it("deduplicates repeated configuration reads until invalidated", async () => {
    findUnique.mockResolvedValue({
      id: "config-1",
      key: "TENANT_RESOLUTION",
      value: {
        mode: "custom-domain",
      },
      updatedAt: new Date(),
    });

    await getTenantResolutionConfig();
    await getTenantResolutionConfig();
    expect(findUnique).toHaveBeenCalledTimes(1);

    invalidateTenantResolutionConfigCache();
    await getTenantResolutionConfig();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
