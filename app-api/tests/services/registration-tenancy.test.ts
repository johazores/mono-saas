import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantMocks = vi.hoisted(() => ({
  resolveCurrentTenantWorkspace: vi.fn(),
  provisionNewUserTenantMembership: vi.fn(),
}));

vi.mock("@/lib/tenant-membership", () => ({
  resolveCurrentTenantWorkspace: tenantMocks.resolveCurrentTenantWorkspace,
  provisionNewUserTenantMembership: tenantMocks.provisionNewUserTenantMembership,
  detachLegacySubUserTenantMembership: vi.fn(),
  syncLegacySubUserTenantMembership: vi.fn(),
}));

vi.mock("@/repositories/user-repository", () => ({
  userRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    findLegacyTenantUserById: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    findByIdWithPassword: vi.fn(),
    findByParentId: vi.fn(),
    countChildren: vi.fn(),
    findDescendants: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    touchLastLogin: vi.fn(),
  },
}));

vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: {
    findByUserId: vi.fn(),
    findById: vi.fn(),
    findActiveSubscription: vi.fn(),
    cancelActiveSubscriptions: vi.fn(),
    checkOwnership: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listAll: vi.fn(),
    deleteByUserId: vi.fn(),
  },
}));

vi.mock("@/repositories/membership-repository", () => ({
  membershipRepository: {
    deleteByUserId: vi.fn(),
  },
}));

vi.mock("@/repositories/product-repository", () => ({
  productRepository: {
    list: vi.fn(),
    listAll: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countActivePurchases: vi.fn(),
  },
}));

vi.mock("@/services/membership-service", () => ({
  membershipService: {
    grantFromPurchase: vi.fn(),
    revokeBySource: vi.fn(),
  },
}));

import { userService } from "@/services/user-service";
import { userRepository } from "@/repositories/user-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { membershipRepository } from "@/repositories/membership-repository";
import { productRepository } from "@/repositories/product-repository";

const users = vi.mocked(userRepository);
const purchases = vi.mocked(purchaseRepository);
const memberships = vi.mocked(membershipRepository);
const products = vi.mocked(productRepository);

const createdUser = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  passwordHash: "hash",
  status: "active",
  parentId: null,
  ancestors: [],
  lastLoginAt: null,
  phone: null,
  address: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  users.create.mockResolvedValue(createdUser as never);
  users.delete.mockResolvedValue(createdUser as never);
  purchases.findActiveSubscription.mockResolvedValue(null as never);
  memberships.deleteByUserId.mockResolvedValue({ count: 0 } as never);
  purchases.deleteByUserId.mockResolvedValue({ count: 0 } as never);
  products.findBySlug.mockResolvedValue(null as never);
  tenantMocks.resolveCurrentTenantWorkspace.mockResolvedValue({
    tenantId: "tenant-a",
    organizationId: "org-a",
  });
  tenantMocks.provisionNewUserTenantMembership.mockResolvedValue(undefined);
});

describe("rollback-safe registration", () => {
  it("provisions the current workspace after account registration", async () => {
    const result = await userService.registerForCurrentWorkspace({
      name: "User",
      email: "user@example.com",
      password: "StrongPass1",
    });

    expect(result?.id).toBe("user-1");
    expect(tenantMocks.provisionNewUserTenantMembership).toHaveBeenCalledWith(
      "user-1",
      { tenantId: "tenant-a", organizationId: "org-a" },
    );
    expect(memberships.deleteByUserId).not.toHaveBeenCalled();
  });

  it("removes registration data when workspace provisioning fails", async () => {
    const failure = new Error("membership failed");
    tenantMocks.provisionNewUserTenantMembership.mockRejectedValue(failure);

    await expect(
      userService.registerForCurrentWorkspace({
        name: "User",
        email: "user@example.com",
        password: "StrongPass1",
      }),
    ).rejects.toBe(failure);

    expect(memberships.deleteByUserId).toHaveBeenCalledWith("user-1");
    expect(purchases.deleteByUserId).toHaveBeenCalledWith("user-1");
    expect(users.delete).toHaveBeenCalledWith("user-1");
    expect(memberships.deleteByUserId.mock.invocationCallOrder[0]).toBeLessThan(
      purchases.deleteByUserId.mock.invocationCallOrder[0],
    );
    expect(purchases.deleteByUserId.mock.invocationCallOrder[0]).toBeLessThan(
      users.delete.mock.invocationCallOrder[0],
    );
  });

  it("removes a partially created account when free-plan creation fails", async () => {
    products.findBySlug.mockResolvedValue({
      id: "free-product",
      currency: "USD",
      accessKeys: [],
    } as never);
    purchases.create.mockRejectedValue(new Error("purchase failed"));

    await expect(
      userService.register({
        name: "User",
        email: "user@example.com",
        password: "StrongPass1",
      }),
    ).rejects.toThrow("purchase failed");

    expect(memberships.deleteByUserId).toHaveBeenCalledWith("user-1");
    expect(purchases.deleteByUserId).toHaveBeenCalledWith("user-1");
    expect(users.delete).toHaveBeenCalledWith("user-1");
  });

  it("surfaces cleanup failure instead of pretending registration rolled back", async () => {
    tenantMocks.provisionNewUserTenantMembership.mockRejectedValue(
      new Error("membership failed"),
    );
    memberships.deleteByUserId.mockRejectedValue(new Error("cleanup failed"));

    await expect(
      userService.registerForCurrentWorkspace({
        name: "User",
        email: "user@example.com",
        password: "StrongPass1",
      }),
    ).rejects.toThrow("Registration failed and cleanup could not complete.");

    expect(purchases.deleteByUserId).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
  });
});
