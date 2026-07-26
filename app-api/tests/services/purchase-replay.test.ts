import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: {
    findByExternalIdForUserProduct: vi.fn(),
    findActiveSubscription: vi.fn(),
    cancelActiveSubscriptions: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/repositories/product-repository", () => ({
  productRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("@/services/membership-service", () => ({
  membershipService: {
    grantFromPurchase: vi.fn(),
    revokeBySource: vi.fn(),
  },
}));

import { purchaseService } from "@/services/purchase-service";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { productRepository } from "@/repositories/product-repository";
import { membershipService } from "@/services/membership-service";

const purchases = vi.mocked(purchaseRepository);
const products = vi.mocked(productRepository);
const memberships = vi.mocked(membershipService);

const product = {
  id: "product-1",
  name: "Starter",
  slug: "starter",
  price: 9.99,
  currency: "USD",
  paymentModel: "recurring",
  accessKeys: ["portal.access"],
  isActive: true,
};

const existingPurchase = {
  id: "purchase-1",
  userId: "user-1",
  productId: "product-1",
  amount: 9.99,
  currency: "USD",
  status: "active",
  externalId: "sub_123",
  product: { name: "Starter" },
};

beforeEach(() => {
  vi.clearAllMocks();
  products.findById.mockResolvedValue(product as never);
  purchases.findByExternalIdForUserProduct.mockResolvedValue(null as never);
});

describe("purchaseService provider replay", () => {
  it("reuses the same provider purchase before subscription replacement", async () => {
    purchases.findByExternalIdForUserProduct.mockResolvedValue(
      existingPurchase as never,
    );

    const result = await purchaseService.create("user-1", "product-1", {
      externalId: "sub_123",
    });

    expect(result).toEqual(existingPurchase);
    expect(purchases.findByExternalIdForUserProduct).toHaveBeenCalledWith(
      "user-1",
      "product-1",
      "sub_123",
    );
    expect(purchases.findActiveSubscription).not.toHaveBeenCalled();
    expect(purchases.cancelActiveSubscriptions).not.toHaveBeenCalled();
    expect(purchases.create).not.toHaveBeenCalled();
    expect(memberships.revokeBySource).not.toHaveBeenCalled();
    expect(memberships.grantFromPurchase).not.toHaveBeenCalled();
  });

  it("creates normally when the provider reference has not been processed", async () => {
    purchases.findActiveSubscription.mockResolvedValue(null as never);
    purchases.create.mockResolvedValue({
      ...existingPurchase,
      id: "purchase-new",
    } as never);
    memberships.grantFromPurchase.mockResolvedValue(undefined as never);

    const result = await purchaseService.create("user-1", "product-1", {
      externalId: "sub_new",
    });

    expect(purchases.findByExternalIdForUserProduct).toHaveBeenCalledWith(
      "user-1",
      "product-1",
      "sub_new",
    );
    expect(purchases.create).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "sub_new" }),
    );
    expect(result.id).toBe("purchase-new");
  });

  it("does not perform replay lookup without an external provider reference", async () => {
    const oneTimeProduct = {
      ...product,
      paymentModel: "one-time",
      accessKeys: [],
    };
    products.findById.mockResolvedValue(oneTimeProduct as never);
    purchases.create.mockResolvedValue({
      ...existingPurchase,
      status: "completed",
      externalId: null,
    } as never);

    await purchaseService.create("user-1", "product-1");

    expect(purchases.findByExternalIdForUserProduct).not.toHaveBeenCalled();
  });
});
