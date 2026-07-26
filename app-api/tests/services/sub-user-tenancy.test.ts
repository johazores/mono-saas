import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));
vi.mock("@/lib/tenant-membership", () => ({
  syncLegacySubUserTenantMembership: vi.fn(),
  detachLegacySubUserTenantMembership: vi.fn(),
}));
vi.mock("@/repositories/user-repository", () => ({
  userRepository: {
    findById: vi.fn(),
    findLegacyTenantUserById: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    findDescendants: vi.fn(),
    countChildren: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: { findActiveSubscription: vi.fn() },
}));
vi.mock("@/repositories/product-repository", () => ({
  productRepository: {},
}));

import { getTenantId } from "@/lib/request-scope";
import {
  detachLegacySubUserTenantMembership,
  syncLegacySubUserTenantMembership,
} from "@/lib/tenant-membership";
import { userRepository } from "@/repositories/user-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { userService } from "@/services/user-service";

const tenant = vi.mocked(getTenantId);
const users = vi.mocked(userRepository);
const purchases = vi.mocked(purchaseRepository);
const syncMembership = vi.mocked(syncLegacySubUserTenantMembership);
const detachMembership = vi.mocked(detachLegacySubUserTenantMembership);

const parent = {
  id: "parent-1",
  tenantId: "tenant-1",
  name: "Parent",
  email: "parent@example.com",
  status: "active",
  parentId: null,
  ancestors: [],
};

const subscription = {
  id: "purchase-1",
  product: {
    id: "product-1",
    name: "Pro",
    slug: "pro",
    accessKeys: ["sub-users.create"],
    maxSubUsers: 3,
  },
};

function child(overrides: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    tenantId: "tenant-1",
    name: "Child",
    email: "child@example.com",
    status: "active",
    parentId: "parent-1",
    ancestors: ["parent-1"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue("tenant-1");
  users.findLegacyTenantUserById.mockResolvedValue(parent as never);
  users.findDescendants.mockResolvedValue([] as never);
  purchases.findActiveSubscription
    .mockResolvedValueOnce(subscription as never)
    .mockResolvedValue(null as never);
  syncMembership.mockResolvedValue(undefined);
  detachMembership.mockResolvedValue(undefined);
});

describe("tenant-bound sub-user service", () => {
  it("rejects an env-wide existing user staged to another tenant", async () => {
    users.findByEmailWithPassword.mockResolvedValue({
      ...child({ parentId: null, ancestors: [] }),
      tenantId: "tenant-2",
    } as never);

    await expect(
      userService.createSubUser("parent-1", { email: "child@example.com" }),
    ).rejects.toThrow("This user is not available in this workspace.");

    expect(users.update).not.toHaveBeenCalled();
    expect(syncMembership).not.toHaveBeenCalled();
  });

  it("syncs membership hierarchy after linking a same-tenant existing user", async () => {
    const existing = child({ parentId: null, ancestors: [] });
    const linked = child();
    users.findByEmailWithPassword.mockResolvedValue(existing as never);
    users.update.mockResolvedValue(linked as never);

    const result = await userService.createSubUser("parent-1", {
      email: "child@example.com",
    });

    expect(syncMembership).toHaveBeenCalledWith("parent-1", "child-1");
    expect(result.linked).toBe(true);
  });

  it("rolls back a legacy link when membership hierarchy sync fails", async () => {
    const existing = child({ parentId: null, ancestors: [] });
    users.findByEmailWithPassword.mockResolvedValue(existing as never);
    users.update.mockResolvedValue(child() as never);
    const failure = new Error("membership sync failed");
    syncMembership.mockRejectedValue(failure);

    await expect(
      userService.createSubUser("parent-1", { email: "child@example.com" }),
    ).rejects.toBe(failure);

    expect(users.update).toHaveBeenNthCalledWith(2, "child-1", {
      parent: { disconnect: true },
      ancestors: { set: [] },
    });
  });

  it("deletes a newly created child when membership hierarchy sync fails", async () => {
    users.findByEmailWithPassword.mockResolvedValue(null as never);
    users.create.mockResolvedValue(child() as never);
    users.delete.mockResolvedValue(child() as never);
    const failure = new Error("membership sync failed");
    syncMembership.mockRejectedValue(failure);

    await expect(
      userService.createSubUser("parent-1", { email: "child@example.com" }),
    ).rejects.toBe(failure);

    expect(users.delete).toHaveBeenCalledWith("child-1");
  });

  it("restores the legacy hierarchy when membership detach fails", async () => {
    const linked = child({ ancestors: ["root-1", "parent-1"] });
    const detached = child({ parentId: null, ancestors: [] });
    users.findLegacyTenantUserById.mockResolvedValue(linked as never);
    users.countChildren.mockResolvedValue(0 as never);
    users.update.mockResolvedValue(detached as never);
    const failure = new Error("membership detach failed");
    detachMembership.mockRejectedValue(failure);

    await expect(
      userService.revokeSubUser("parent-1", "child-1"),
    ).rejects.toBe(failure);

    expect(users.update).toHaveBeenNthCalledWith(2, "child-1", {
      parent: { connect: { id: "parent-1" } },
      ancestors: { set: ["root-1", "parent-1"] },
    });
  });
});
