import { purchaseRepository } from "@/repositories/purchase-repository";
import { productRepository } from "@/repositories/product-repository";
import type { PurchaseRecord } from "@/types";

/**
 * Compute a fallback end date for admin-created subscriptions when no Stripe
 * data is available. For Stripe-synced purchases the end date comes directly
 * from Stripe's `current_period_end` — this function is NOT used in that path.
 */
function computeEndDate(interval: string | null, from?: Date): Date | null {
  if (!interval) return null;
  const start = from ?? new Date();
  const end = new Date(start);
  if (interval === "year") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    // default to month
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export const purchaseService = {
  async create(
    userId: string,
    productId: string,
    options?: { externalId?: string; metadata?: Record<string, unknown> },
  ): Promise<PurchaseRecord> {
    const product = await productRepository.findById(productId);
    if (!product) throw new Error("Product not found.");
    if (!product.isActive)
      throw new Error("This product is no longer available.");

    // Browser-return verification can be retried after a partial response or
    // page refresh. Reuse the exact tenant/user/product/provider record before
    // performing any subscription replacement or creating another purchase.
    if (options?.externalId) {
      const existing = await purchaseRepository.findByExternalIdForUserProduct(
        userId,
        productId,
        options.externalId,
      );
      if (existing) return existing as PurchaseRecord;
    }

    const isSubscription = product.paymentModel === "recurring";

    // For recurring products, cancel existing subscriptions first
    if (isSubscription) {
      const existing = await purchaseRepository.findActiveSubscription(userId);
      if (existing) {
        const { membershipService } =
          await import("@/services/membership-service");
        await membershipService.revokeBySource(existing.id);
        await purchaseRepository.cancelActiveSubscriptions(userId);
      }
    }

    const purchase = await purchaseRepository.create({
      user: { connect: { id: userId } },
      product: { connect: { id: productId } },
      amount: product.price,
      currency: product.currency,
      status: isSubscription ? "active" : "completed",
      externalId: options?.externalId || null,
      endDate: options?.metadata?.endDate
        ? new Date(options.metadata.endDate as string)
        : isSubscription
          ? computeEndDate("month")
          : null,
      metadata: (options?.metadata ?? null) as never,
    });

    // Grant membership if product has access keys
    if (product.accessKeys.length > 0) {
      const { membershipService } =
        await import("@/services/membership-service");
      await membershipService.grantFromPurchase(
        userId,
        purchase.id,
        product.accessKeys,
      );
    }

    return purchase as PurchaseRecord;
  },

  /** Subscribe a user to a recurring product (admin action). */
  async subscribe(
    userId: string,
    productId: string,
    options?: { externalId?: string; endDate?: string },
  ): Promise<PurchaseRecord> {
    const product = await productRepository.findById(productId);
    if (!product) throw new Error("Product not found.");
    if (!product.isActive)
      throw new Error("This product is no longer available.");
    if (product.paymentModel !== "recurring")
      throw new Error("This product is not a subscription.");

    // Cancel any active subscription
    const existing = await purchaseRepository.findActiveSubscription(userId);
    if (existing) {
      const { membershipService } =
        await import("@/services/membership-service");
      await membershipService.revokeBySource(existing.id);
      await purchaseRepository.cancelActiveSubscriptions(userId);
    }

    const purchase = await purchaseRepository.create({
      user: { connect: { id: userId } },
      product: { connect: { id: productId } },
      amount: product.price,
      currency: product.currency,
      status: "active",
      externalId: options?.externalId || null,
      endDate: options?.endDate
        ? new Date(options.endDate)
        : computeEndDate("month"),
    });

    // Grant membership from product features
    if (product.accessKeys.length > 0) {
      const { membershipService } =
        await import("@/services/membership-service");
      await membershipService.grantFromPurchase(
        userId,
        purchase.id,
        product.accessKeys,
      );
    }

    return purchase as PurchaseRecord;
  },

  /** Cancel a user's active subscription. */
  async cancelSubscription(userId: string): Promise<void> {
    const active = await purchaseRepository.findActiveSubscription(userId);
    if (active) {
      const { membershipService } =
        await import("@/services/membership-service");
      await membershipService.revokeBySource(active.id);
    }
    await purchaseRepository.cancelActiveSubscriptions(userId);

    // Assign free product
    const freeProduct = await productRepository.findBySlug("free");
    if (freeProduct) {
      const purchase = await purchaseRepository.create({
        user: { connect: { id: userId } },
        product: { connect: { id: freeProduct.id } },
        amount: 0,
        currency: freeProduct.currency,
        status: "active",
      });
      if (freeProduct.accessKeys.length > 0) {
        const { membershipService } =
          await import("@/services/membership-service");
        await membershipService.grantFromPurchase(
          userId,
          purchase.id,
          freeProduct.accessKeys,
        );
      }
    }
  },

  /** Check and expire old subscriptions. */
  async checkExpired(): Promise<number> {
    const expired = await purchaseRepository.findExpiredSubscriptions();
    if (expired.length === 0) return 0;

    const { membershipService } = await import("@/services/membership-service");
    for (const sub of expired) {
      await membershipService.revokeBySource(sub.id);
    }

    const ids = expired.map((s) => s.id);
    await purchaseRepository.expireBatch(ids);
    return ids.length;
  },

  async getActiveSubscription(userId: string): Promise<PurchaseRecord | null> {
    const sub = await purchaseRepository.findActiveSubscription(userId);
    return sub as PurchaseRecord | null;
  },

  async getHistory(userId: string): Promise<PurchaseRecord[]> {
    const purchases = await purchaseRepository.findByUserId(userId);
    return purchases as PurchaseRecord[];
  },

  async checkOwnership(userId: string, productId: string): Promise<boolean> {
    const purchase = await purchaseRepository.checkOwnership(userId, productId);
    return !!purchase;
  },

  async listAll(): Promise<PurchaseRecord[]> {
    const purchases = await purchaseRepository.listAll();
    return purchases as PurchaseRecord[];
  },

  async getById(id: string): Promise<PurchaseRecord | null> {
    const purchase = await purchaseRepository.findById(id);
    return purchase as PurchaseRecord | null;
  },
};
