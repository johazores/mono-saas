import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantMocks = vi.hoisted(() => ({
  hasActiveCurrentTenantMembership: vi.fn(),
  provisionNewUserTenantMembership: vi.fn(),
  resolveCurrentTenantWorkspace: vi.fn(),
}));

vi.mock("@/lib/tenant-membership", () => ({
  hasActiveCurrentTenantMembership: tenantMocks.hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership: tenantMocks.provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace: tenantMocks.resolveCurrentTenantWorkspace,
}));

vi.mock("@/repositories/checkout-repository", () => ({
  checkoutRepository: {
    findBySessionId: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("@/repositories/product-repository", () => ({
  productRepository: { findById: vi.fn() },
}));
vi.mock("@/repositories/product-price-repository", () => ({
  productPriceRepository: { findActivePrice: vi.fn() },
}));
vi.mock("@/repositories/user-repository", () => ({
  userRepository: {
    findById: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/services/purchase-service", () => ({
  purchaseService: { create: vi.fn() },
}));
vi.mock("@/lib/password", () => ({ hashPassword: vi.fn(() => "hashed") }));
vi.mock("@/lib/payment", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentConfig: vi.fn(),
}));

import { checkoutService } from "@/services/checkout-service";
import { checkoutRepository } from "@/repositories/checkout-repository";
import { userRepository } from "@/repositories/user-repository";
import { purchaseService } from "@/services/purchase-service";
import { getPaymentConfig, getPaymentProvider } from "@/lib/payment";

const checkouts = vi.mocked(checkoutRepository);
const users = vi.mocked(userRepository);
const purchases = vi.mocked(purchaseService);
const paymentConfig = vi.mocked(getPaymentConfig);
const paymentProvider = vi.mocked(getPaymentProvider);

const provider = {
  verifySession: vi.fn(),
  createCheckoutSession: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getCustomerSubscriptions: vi.fn(),
  getCustomerInvoices: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  paymentConfig.mockResolvedValue({
    provider: "stripe",
    mode: "test",
    publicKey: "pk_test",
    secretKey: "sk_test",
  });
  paymentProvider.mockReturnValue(provider);
  tenantMocks.resolveCurrentTenantWorkspace.mockResolvedValue({
    tenantId: "tenant-a",
    organizationId: "org-a",
  });
  tenantMocks.hasActiveCurrentTenantMembership.mockResolvedValue(true);
  tenantMocks.provisionNewUserTenantMembership.mockResolvedValue(undefined);
  users.findByEmailWithPassword.mockResolvedValue(null as never);
  users.create.mockResolvedValue({
    id: "guest-1",
    email: "guest@example.com",
    name: "Guest",
  } as never);
  users.delete.mockResolvedValue({ id: "guest-1" } as never);
  users.update.mockResolvedValue({} as never);
  checkouts.findBySessionId.mockResolvedValue({
    id: "checkout-1",
    sessionId: "cs_guest",
    userId: null,
    guestEmail: "guest@example.com",
    guestName: "Guest",
    items: [{ productId: "product-1", quantity: 1 }],
    status: "pending",
    provider: "stripe",
  } as never);
  provider.verifySession.mockResolvedValue({
    sessionId: "cs_guest",
    paymentStatus: "paid",
    customerId: "cus_guest",
    customerEmail: "guest@example.com",
    customerName: "Guest",
    metadata: {},
    lineItems: [],
  });
});

describe("checkout guest verification recovery", () => {
  it("deletes the new guest user when workspace provisioning fails", async () => {
    const failure = new Error("membership failed");
    tenantMocks.provisionNewUserTenantMembership.mockRejectedValue(failure);

    await expect(checkoutService.verifySession("cs_guest")).rejects.toBe(failure);

    expect(users.delete).toHaveBeenCalledWith("guest-1");
    expect(purchases.create).not.toHaveBeenCalled();
    expect(checkouts.updateStatus).not.toHaveBeenCalled();
  });

  it("surfaces cleanup failure when the new guest user cannot be removed", async () => {
    tenantMocks.provisionNewUserTenantMembership.mockRejectedValue(
      new Error("membership failed"),
    );
    users.delete.mockRejectedValue(new Error("delete failed"));

    await expect(checkoutService.verifySession("cs_guest")).rejects.toThrow(
      "Checkout user provisioning failed and cleanup could not complete.",
    );

    expect(purchases.create).not.toHaveBeenCalled();
  });
});
