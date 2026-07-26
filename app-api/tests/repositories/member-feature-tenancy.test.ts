import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    feature: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import { getAppEnv } from "@/lib/env";
import { membershipRepository } from "@/repositories/membership-repository";
import { featureRepository } from "@/repositories/feature-repository";

const tenant = vi.mocked(getTenantId);
const env = vi.mocked(getAppEnv);
const memberships = vi.mocked(prisma.membership);
const features = vi.mocked(prisma.feature);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
  env.mockResolvedValue("dev");
});

describe("member entitlement tenant reads", () => {
  it("qualifies active membership reads by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    memberships.findMany.mockResolvedValue([]);

    await membershipRepository.findActiveByUserId("user-1");

    expect(memberships.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", userId: "user-1", status: "active" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("qualifies membership source revocation by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    memberships.updateMany.mockResolvedValue({ count: 1 });

    await membershipRepository.revokeBySourceId("purchase-1");

    expect(memberships.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        sourceId: "purchase-1",
        status: "active",
      },
      data: { status: "revoked" },
    });
  });

  it("qualifies active feature definitions by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    features.findMany.mockResolvedValue([]);

    await featureRepository.list();

    expect(features.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  });

  it("rejects a legacy env-key feature staged to another tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    features.findUnique.mockResolvedValue({
      id: "feature-1",
      tenantId: "tenant-2",
    } as never);

    await expect(featureRepository.findByKey("api.access")).resolves.toBeNull();
    expect(features.findUnique).toHaveBeenCalledWith({
      where: { env_key: { env: "dev", key: "api.access" } },
    });
  });

  it("preserves deployment-only membership and feature reads", async () => {
    memberships.findMany.mockResolvedValue([]);
    features.findMany.mockResolvedValue([]);

    await membershipRepository.findByUserId("user-1");
    await featureRepository.list();

    expect(memberships.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(features.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  });
});
