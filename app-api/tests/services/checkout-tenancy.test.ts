import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/checkout-repository", () => ({
  checkoutRepository: {
    create: vi.fn(),
    findBySessionId: vi.fn(),
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
  },
}));
vi.mock("@/services/purchase-service", () => ({
  purchaseService: { create: vi.fn() },
}));
vi.mock("@/lib/payment", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentConfig: vi.fn(),
}));
vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(() => "hashed-password"),
}));
vi.mock("@/lib/tenant-membership", () => ({
  hasActiveCurrentTenantMembership: vi.fn(),
  provisionNewUserTenantMembership: vi.fn(),
  resolveCurrentTenantWorkspace: vi.fn(),
}));

import { checkoutRepository } from "@/repositories/checkout-repository";
import { productRepository } from "@/repositories/product-repository";
import { productPriceRepository } from "@/repositories/product-price-repository";
import { userRepository } from "@/repositories/user-repository";
import { purchaseService } from "@/services/purchase-service";
import { getPaymentConfig, getPaymentProvider } from "@/lib/payment";
import {
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
} from "@/lib/tenant-membership";
import { checkoutService } from "@/services/checkout-service";

const checkoutRepo = vi.mocked(checkoutRepository);
const products = vi.mocked(productRepository);
const prices = vi.mocked(productPriceRepository);
const users = vi.mocked(userRepository);
const purchases = vi.mocked(purchaseService);
const config = vi.mocked(getPaymentConfig);
const providerRegistry = vi.mocked(getPaymentProvider);
const hasMembership = vi.mocked(hasActiveCurrentTenantMembership);
const provisionMembership = vi.mocked(provisionNewUserTenantMembership);
const resolveWorkspace = vi.mocked(resolveCurrentTenantWorkspace);

const paymentProvider = {
  createCheckoutSession: vi.fn(),
  verifySession: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getCustomerSubscriptions: vi.fn(),
  getCustomerInvoices: vi.fn(),
};

const paymentConfig = {
  provider: "stripe" as const,
  mode: "test" as const,
  publicKey: "pk_test",
  secretKey: "sk_test",
};

const workspace = { tenantId: "tenant-1", organizationId: "org-1" };

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "checkout-1",
    sessionId: "cs_123",
    userId: null,
    guestEmail: null,
    guestName: null,
    items: [{ productId: "product-1", quantity: 1 }],
    status: "pending",
    provider: "stripe",
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  config.mockResolvedValue(paymentConfig);
  providerRegistry.mockReturnValue(paymentProvider as never);
  hasMembership.mockResolvedValue(true);
  resolveWorkspace.mockResolvedValue(workspace);
  products.findById.mockResolvedValue({
    id: "product-1",
    name: "Starter",
    isActive: true,
    paymentModel: "one-time",
    price: 10,
    currency: "USD",
  } as never);
  prices.findActivePrice.mockResolvedValue({
    stripePriceId: "price_123",
    amount: 10,
  } as never);
  paymentProvider.createCheckoutSession.mockResolvedValue({
    sessionId: "cs_123",
    redirectUrl: "https://checkout.example/cs_123",
  });
  paymentProvider.verifySession.mockResolvedValue({
    sessionId: "cs_123",
    paymentStatus: "paid",
    customerId: "cus_123",
    customerEmail: "guest@example.com",
    customerName: "Guest User",
    metadata: {},
    lineItems: [],
  });
  purchases.create.mockResolvedValue({
    id: "purchase-1",
    productId: "product-1",
    amount: 10,
    status: "completed",
    product: { name: "Starter" },
  } as never);
  users.update.mockResolvedValue({} as never);
});

describe("tenant checkout creation", () => {
  it("rejects an authenticated user that is not a current tenant member", async () => {
    hasMembership.mockResolvedValue(false);

    await expect(
      checkoutService.createSession(
        {
          items: [{ productId: "product-1", quantity: 1 }],
          successUrl: "https://app.example/success",
          cancelUrl: "https://app.example/cancel",
        },
        "user-1",
      ),
    ).rejects.toThrow("User is not available for this tenant");

    expect(config).not.toHaveBeenCalled();
    expect(products.findById).not.toHaveBeenCalled();
  });
});

describe("tenant checkout verification", () => {
  it("requires membership for an authenticated checkout session", async () => {
    checkoutRepo.findBySessionId.mockResolvedValue(
      checkoutSession({ userId: "user-1" }) as never,
    );
    hasMembership.mockResolvedValue(false);

    await expect(checkoutService.verifySession("cs_123")).rejects.toThrow(
      "Checkout user is not available for this tenant",
    );

    expect(purchases.create).not.toHaveBeenCalled();
    expect(checkoutRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("recovers a paid existing guest user only through same-tenant membership provisioning", async () => {
    checkoutRepo.findBySessionId.mockResolvedValue(checkoutSession() as never);
    users.findByEmailWithPassword.mockResolvedValue({
      id: "user-existing",
      email: "guest@example.com",
    } as never);
    hasMembership.mockResolvedValue(false);

    await checkoutService.verifySession("cs_123");

    expect(provisionMembership).toHaveBeenCalledWith(
      "user-existing",
      workspace,
    );
    expect(purchases.create).toHaveBeenCalledWith(
      "user-existing",
      "product-1",
      expect.objectContaining({ externalId: "cs_123" }),
    );
    expect(checkoutRepo.updateStatus).toHaveBeenCalledWith(
      "checkout-1",
      "completed",
    );
  });

  it("does not create a purchase when existing-user membership provisioning fails", async () => {
    checkoutRepo.findBySessionId.mockResolvedValue(checkoutSession() as never);
    users.findByEmailWithPassword.mockResolvedValue({
      id: "user-other-tenant",
      email: "guest@example.com",
    } as never);
    hasMembership.mockResolvedValue(false);
    provisionMembership.mockRejectedValue(
      new Error("Tenant workspace is not available."),
    );

    await expect(checkoutService.verifySession("cs_123")).rejects.toThrow(
      "Tenant workspace is not available",
    );

    expect(purchases.create).not.toHaveBeenCalled();
    expect(checkoutRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("provisions a new guest user before creating purchases", async () => {
    checkoutRepo.findBySessionId.mockResolvedValue(checkoutSession() as never);
    users.findByEmailWithPassword.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: "user-new",
      email: "guest@example.com",
      name: "Guest User",
    } as never);
    const order: string[] = [];
    provisionMembership.mockImplementation(async () => {
      order.push("membership");
    });
    purchases.create.mockImplementation(async () => {
      order.push("purchase");
      return {
        id: "purchase-1",
        productId: "product-1",
        amount: 10,
        status: "completed",
        product: { name: "Starter" },
      } as never;
    });

    const result = await checkoutService.verifySession("cs_123");

    expect(order).toEqual(["membership", "purchase"]);
    expect(provisionMembership).toHaveBeenCalledWith("user-new", workspace);
    expect(result.user).toEqual({
      id: "user-new",
      email: "guest@example.com",
      name: "Guest User",
    });
  });
});
