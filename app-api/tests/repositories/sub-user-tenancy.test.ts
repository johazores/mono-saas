import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userSession: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import { userRepository } from "@/repositories/user-repository";

const tenant = vi.mocked(getTenantId);
const users = vi.mocked(prisma.user);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
});

describe("legacy sub-user repository tenant scope", () => {
  it("qualifies legacy user-by-id lookup when tenant context exists", async () => {
    tenant.mockReturnValue("tenant-1");
    users.findFirst.mockResolvedValue(null);

    await userRepository.findLegacyTenantUserById("user-1");

    expect(users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", tenantId: "tenant-1" },
      }),
    );
    expect(users.findUnique).not.toHaveBeenCalled();
  });

  it("qualifies parent, child-count, and descendant hierarchy reads by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    users.findMany.mockResolvedValue([]);
    users.count.mockResolvedValue(0);

    await userRepository.findByParentId("parent-1");
    await userRepository.countChildren("parent-1");
    await userRepository.findDescendants("parent-1");

    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", parentId: "parent-1" },
      }),
    );
    expect(users.count).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", parentId: "parent-1" },
    });
    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          ancestors: { has: "parent-1" },
        },
      }),
    );
  });

  it("preserves deployment-only legacy hierarchy reads", async () => {
    users.findUnique.mockResolvedValue(null);
    users.findMany.mockResolvedValue([]);

    await userRepository.findLegacyTenantUserById("user-1");
    await userRepository.findByParentId("parent-1");

    expect(users.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: "parent-1" } }),
    );
  });
});
