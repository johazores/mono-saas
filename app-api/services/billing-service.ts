import { userRepository } from "@/repositories/user-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { productRepository } from "@/repositories/product-repository";
import { getPaymentProvider, getPaymentConfig } from "@/lib/payment";
import type { BillingStatus, ProviderInvoice } from "@/types";

const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const lastSyncMap = new Map<string, number>();

export const billingService = {
  syncInBackground(userId: string): void {
    billingService.syncPurchases(userId).catch(() => {
      // Best-effort synchronization must not break the calling request.
    });
  },

  async forceSyncPurchases(userId: string): Promise<{ synced: number }> {
    lastSyncMap.delete(userId);
    return billingService.syncPurchases(userId);
  },

  /**
   * Current schema compatibility: customer references still live in the
   * Stripe-named User field until T-702 moves them to provider references.
   */
  async ensureStripeCustomer(userId: string): Promise<string> {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error("User not found.");

    if (user.stripeCustomerId) return user.stripeCustomerId;

    const config = await getPaymentConfig();
    const provider = getPaymentProvider(config.provider);
    const customerId = await provider.findOrCreateCustomer(
      user.email,
      user.name,
      config,
    );

    await userRepository.update(userId, { stripeCustomerId: customerId });
    return customerId;
  },

  async createPortalSession(
    userId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const customerId = await billingService.ensureStripeCustomer(userId);
    const config = await getPaymentConfig();
    const provider = getPaymentProvider(config.provider);

    return provider.createBillingPortalSession(customerId, returnUrl, config);
  },

  async getStatus(userId: string): Promise<BillingStatus> {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error("User not found.");

    if (!user.stripeCustomerId) {
      return {
        hasStripeCustomer: false,
        portalUrl: null,
        subscriptions: [],
        invoices: [],
        syncedAt: null,
      };
    }

    const config = await getPaymentConfig();
    const provider = getPaymentProvider(config.provider);
    const [subscriptions, invoices] = await Promise.all([
      provider.getCustomerSubscriptions(user.stripeCustomerId, config),
      provider.getCustomerInvoices(user.stripeCustomerId, config),
    ]);
    const lastSync = lastSyncMap.get(userId);

    return {
      hasStripeCustomer: true,
      portalUrl: null,
      subscriptions,
      invoices,
      syncedAt: lastSync ? new Date(lastSync).toISOString() : null,
    };
  },

  async syncPurchases(userId: string): Promise<{ synced: number }> {
    const lastSync = lastSyncMap.get(userId);
    if (lastSync && Date.now() - lastSync < SYNC_THROTTLE_MS) {
      return { synced: 0 };
    }

    const user = await userRepository.findById(userId);
    if (!user) throw new Error("User not found.");
    if (!user.stripeCustomerId) return { synced: 0 };

    const config = await getPaymentConfig();
    const provider = getPaymentProvider(config.provider);
    const [subscriptions, invoices] = await Promise.all([
      provider.getCustomerSubscriptions(user.stripeCustomerId, config),
      provider.getCustomerInvoices(user.stripeCustomerId, config),
    ]);

    // T-702 replaces this provider-specific schema lookup with external refs.
    const allProducts = await productRepository.listAll();
    const productByExternalId = new Map<string, (typeof allProducts)[0]>();
    for (const product of allProducts) {
      if (config.mode === "live") {
        if (product.stripeLiveProductId) {
          productByExternalId.set(product.stripeLiveProductId, product);
        }
      } else if (product.stripeTestProductId) {
        productByExternalId.set(product.stripeTestProductId, product);
      }
    }

    let synced = 0;

    for (const subscription of subscriptions) {
      const localProduct = matchProduct(
        subscription.items,
        productByExternalId,
      );
      if (!localProduct) continue;

      await upsertPurchase(userId, localProduct.id, {
        externalId: subscription.id,
        amount: localProduct.price,
        currency: localProduct.currency,
        status: mapSubscriptionStatus(subscription.status),
        endDate: new Date(subscription.currentPeriodEnd * 1000),
        cancelledAt: subscription.cancelAtPeriodEnd
          ? new Date(subscription.currentPeriodEnd * 1000)
          : null,
        metadata: {
          provider: config.provider,
          providerType: "subscription",
          interval: subscription.interval,
          syncedAt: new Date().toISOString(),
        },
      });
      synced += 1;
    }

    const syncedSubscriptionIds = new Set(
      subscriptions.map((subscription) => subscription.id),
    );

    for (const invoice of invoices) {
      if (invoice.status !== "paid") continue;
      if (
        invoice.subscriptionId &&
        syncedSubscriptionIds.has(invoice.subscriptionId)
      ) {
        continue;
      }

      const localProduct = matchInvoiceProduct(
        invoice,
        productByExternalId,
      );
      if (!localProduct) continue;

      await upsertPurchase(userId, localProduct.id, {
        externalId: invoice.id,
        paymentIntentId: invoice.paymentId,
        amount: invoice.amountPaid,
        currency: invoice.currency,
        status: "completed",
        startDate: new Date(invoice.periodStart * 1000),
        endDate: invoice.periodEnd
          ? new Date(invoice.periodEnd * 1000)
          : null,
        metadata: {
          provider: config.provider,
          providerType: "invoice",
          hostedUrl: invoice.hostedUrl,
          pdfUrl: invoice.pdfUrl,
          syncedAt: new Date().toISOString(),
        },
      });
      synced += 1;
    }

    lastSyncMap.set(userId, Date.now());
    return { synced };
  },
};

function mapSubscriptionStatus(
  providerStatus: string,
): "active" | "cancelled" | "expired" | "pending" {
  switch (providerStatus) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
      return "cancelled";
    case "past_due":
    case "unpaid":
      return "pending";
    case "incomplete":
    case "incomplete_expired":
      return "expired";
    default:
      return "active";
  }
}

function matchProduct(
  items: { priceId: string; productId: string }[],
  lookup: Map<string, { id: string }>,
): { id: string; price: number; currency: string } | null {
  for (const item of items) {
    const byProduct = lookup.get(item.productId);
    if (byProduct) {
      return byProduct as { id: string; price: number; currency: string };
    }
    const byPrice = lookup.get(item.priceId);
    if (byPrice) {
      return byPrice as { id: string; price: number; currency: string };
    }
  }
  return null;
}

function matchInvoiceProduct(
  invoice: ProviderInvoice,
  lookup: Map<string, { id: string }>,
): { id: string; price: number; currency: string } | null {
  if (invoice.productId) {
    const product = lookup.get(invoice.productId);
    if (product) {
      return product as { id: string; price: number; currency: string };
    }
  }
  if (invoice.priceId) {
    const product = lookup.get(invoice.priceId);
    if (product) {
      return product as { id: string; price: number; currency: string };
    }
  }
  return null;
}

async function upsertPurchase(
  userId: string,
  productId: string,
  data: {
    externalId: string;
    paymentIntentId?: string | null;
    amount: number;
    currency: string;
    status: string;
    startDate?: Date;
    endDate?: Date | null;
    cancelledAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  let existing = await purchaseRepository.findByExternalId(data.externalId);

  if (!existing && data.paymentIntentId) {
    existing = await purchaseRepository.findByExternalId(data.paymentIntentId);
  }

  if (existing) {
    return purchaseRepository.update(existing.id, {
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      endDate: data.endDate ?? existing.endDate,
      cancelledAt: data.cancelledAt ?? existing.cancelledAt,
      metadata: data.metadata as never,
    });
  }

  return purchaseRepository.create({
    user: { connect: { id: userId } },
    product: { connect: { id: productId } },
    externalId: data.externalId,
    amount: data.amount,
    currency: data.currency,
    status: data.status,
    startDate: data.startDate,
    endDate: data.endDate,
    cancelledAt: data.cancelledAt,
    metadata: (data.metadata ?? null) as never,
  });
}
