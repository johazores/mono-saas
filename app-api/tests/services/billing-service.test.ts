import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/user-repository", () => ({
  userRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: {
    findByExternalId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/repositories/product-repository", () => ({
  productRepository: {
    listAll: vi.fn(),
  },
}));

vi.mock("@/lib/payment", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentConfig: vi.fn(),
}));

import { billingService } from "@/services/billing-service";
import { userRepository } from "@/repositories/user-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { productRepository } from "@/repositories/product-repository";
import { getPaymentProvider, getPaymentConfig } from "@/lib/payment";

const userRepo = vi.mocked(userRepository);
const purchaseRepo = vi.mocked(purchaseRepository);
const productRepo = vi.mocked(productRepository);
const mockGetProvider = vi.mocked(getPaymentProvider);
const mockGetConfig = vi.mocked(getPaymentConfig);

const mockProvider = {
  findOrCreateCustomer: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getCustomerSubscriptions: vi.fn(),
  getCustomerInvoices: vi.fn(),
  createCheckoutSession: vi.fn(),
  verifySession: vi.fn(),
};

const testConfig = {
  provider: "stripe" as const,
  mode: "test" as const,
  publicKey: "pk_test_123",
  secretKey: "sk_test_123",
};

const subscription = {
  id: "sub_1",
  status: "active",
  currentPeriodEnd: 1_700_000_000,
  cancelAtPeriodEnd: false,
  interval: "month",
  items: [{ priceId: "price_test_1", productId: "prod_external_1" }],
};

const product = {
  id: "p1",
  price: 9.99,
  currency: "USD",
  stripeTestProductId: "prod_external_1",
  stripeLiveProductId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProvider.mockReturnValue(mockProvider);
  mockGetConfig.mockResolvedValue(testConfig);
});

describe("billingService.ensureStripeCustomer", () => {
  it("returns an existing customer ID", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      name: "Test",
      stripeCustomerId: "cus_existing",
    } as never);

    await expect(billingService.ensureStripeCustomer("u1")).resolves.toBe(
      "cus_existing",
    );
    expect(mockProvider.findOrCreateCustomer).not.toHaveBeenCalled();
  });

  it("creates and stores a missing customer reference", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      name: "Test",
      stripeCustomerId: null,
    } as never);
    mockProvider.findOrCreateCustomer.mockResolvedValue("cus_new");
    userRepo.update.mockResolvedValue({} as never);

    await expect(billingService.ensureStripeCustomer("u1")).resolves.toBe(
      "cus_new",
    );
    expect(mockProvider.findOrCreateCustomer).toHaveBeenCalledWith(
      "test@example.com",
      "Test",
      testConfig,
    );
    expect(userRepo.update).toHaveBeenCalledWith("u1", {
      stripeCustomerId: "cus_new",
    });
  });

  it("throws when the user does not exist", async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(billingService.ensureStripeCustomer("u1")).rejects.toThrow(
      "User not found.",
    );
  });
});

describe("billingService.getStatus", () => {
  it("returns empty billing data without a customer reference", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: null,
    } as never);

    await expect(billingService.getStatus("u1")).resolves.toMatchObject({
      hasStripeCustomer: false,
      subscriptions: [],
      invoices: [],
    });
  });

  it("returns provider-neutral subscriptions and invoices", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: "cus_123",
    } as never);
    mockProvider.getCustomerSubscriptions.mockResolvedValue([subscription]);
    mockProvider.getCustomerInvoices.mockResolvedValue([
      {
        id: "inv_1",
        status: "paid",
        amountPaid: 9.99,
        currency: "USD",
        subscriptionId: null,
        paymentId: "pi_1",
        productId: "prod_external_1",
        priceId: "price_test_1",
        periodStart: 1_699_000_000,
        periodEnd: 1_700_000_000,
        hostedUrl: null,
        pdfUrl: null,
        created: 1_699_000_000,
      },
    ]);

    const status = await billingService.getStatus("u1");
    expect(status.hasStripeCustomer).toBe(true);
    expect(status.subscriptions).toEqual([subscription]);
    expect(status.invoices[0]).toMatchObject({
      paymentId: "pi_1",
      productId: "prod_external_1",
      priceId: "price_test_1",
    });
  });
});

describe("billingService.syncPurchases", () => {
  it("returns zero without a customer reference", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: null,
    } as never);

    await expect(billingService.forceSyncPurchases("u1")).resolves.toEqual({
      synced: 0,
    });
  });

  it("creates a purchase from a provider-neutral subscription", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: "cus_123",
    } as never);
    mockProvider.getCustomerSubscriptions.mockResolvedValue([subscription]);
    mockProvider.getCustomerInvoices.mockResolvedValue([]);
    productRepo.listAll.mockResolvedValue([product] as never);
    purchaseRepo.findByExternalId.mockResolvedValue(null);
    purchaseRepo.create.mockResolvedValue({ id: "pur_1" } as never);

    await expect(billingService.forceSyncPurchases("u1")).resolves.toEqual({
      synced: 1,
    });
    expect(purchaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "sub_1",
        status: "active",
        amount: 9.99,
        metadata: expect.objectContaining({
          provider: "stripe",
          providerType: "subscription",
        }),
      }),
    );
  });

  it("updates an existing subscription purchase", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: "cus_123",
    } as never);
    mockProvider.getCustomerSubscriptions.mockResolvedValue([
      {
        ...subscription,
        status: "canceled",
        cancelAtPeriodEnd: true,
      },
    ]);
    mockProvider.getCustomerInvoices.mockResolvedValue([]);
    productRepo.listAll.mockResolvedValue([product] as never);
    purchaseRepo.findByExternalId.mockResolvedValue({
      id: "pur_existing",
      endDate: null,
      cancelledAt: null,
    } as never);
    purchaseRepo.update.mockResolvedValue({} as never);

    await expect(billingService.forceSyncPurchases("u1")).resolves.toEqual({
      synced: 1,
    });
    expect(purchaseRepo.update).toHaveBeenCalledWith(
      "pur_existing",
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("skips an invoice belonging to a synchronized subscription", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: "cus_123",
    } as never);
    mockProvider.getCustomerSubscriptions.mockResolvedValue([subscription]);
    mockProvider.getCustomerInvoices.mockResolvedValue([
      {
        id: "inv_1",
        status: "paid",
        amountPaid: 9.99,
        currency: "USD",
        subscriptionId: "sub_1",
        paymentId: "pi_1",
        productId: "prod_external_1",
        priceId: "price_test_1",
        periodStart: 1_699_000_000,
        periodEnd: 1_700_000_000,
        hostedUrl: null,
        pdfUrl: null,
        created: 1_699_000_000,
      },
    ]);
    productRepo.listAll.mockResolvedValue([product] as never);
    purchaseRepo.findByExternalId.mockResolvedValue(null);
    purchaseRepo.create.mockResolvedValue({ id: "pur_1" } as never);

    await expect(billingService.forceSyncPurchases("u1")).resolves.toEqual({
      synced: 1,
    });
    expect(purchaseRepo.create).toHaveBeenCalledTimes(1);
    expect(purchaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "sub_1" }),
    );
  });

  it("creates a purchase from a standalone neutral invoice", async () => {
    userRepo.findById.mockResolvedValue({
      id: "u1",
      stripeCustomerId: "cus_123",
    } as never);
    mockProvider.getCustomerSubscriptions.mockResolvedValue([]);
    mockProvider.getCustomerInvoices.mockResolvedValue([
      {
        id: "inv_standalone",
        status: "paid",
        amountPaid: 49.99,
        currency: "USD",
        subscriptionId: null,
        paymentId: "pi_standalone",
        productId: "prod_external_1",
        priceId: null,
        periodStart: 1_699_000_000,
        periodEnd: 1_699_000_000,
        hostedUrl: "https://billing.example/invoice",
        pdfUrl: "https://billing.example/invoice.pdf",
        created: 1_699_000_000,
      },
    ]);
    productRepo.listAll.mockResolvedValue([product] as never);
    purchaseRepo.findByExternalId.mockResolvedValue(null);
    purchaseRepo.create.mockResolvedValue({ id: "pur_2" } as never);

    await expect(billingService.forceSyncPurchases("u1")).resolves.toEqual({
      synced: 1,
    });
    expect(purchaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "inv_standalone",
        amount: 49.99,
        status: "completed",
        metadata: expect.objectContaining({
          provider: "stripe",
          providerType: "invoice",
        }),
      }),
    );
  });
});

describe("billingService.syncInBackground", () => {
  it("does not throw synchronously", () => {
    userRepo.findById.mockRejectedValue(new Error("DB down"));
    expect(() => billingService.syncInBackground("u1")).not.toThrow();
  });
});
