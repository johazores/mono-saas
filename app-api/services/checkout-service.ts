import { checkoutRepository } from "@/repositories/checkout-repository";
import { productRepository } from "@/repositories/product-repository";
import { productPriceRepository } from "@/repositories/product-price-repository";
import { purchaseService } from "@/services/purchase-service";
import { userRepository } from "@/repositories/user-repository";
import { getPaymentProvider, getPaymentConfig } from "@/lib/payment";
import {
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
} from "@/lib/tenant-membership";
import { hashPassword } from "@/lib/password";
import crypto from "crypto";
import type { CreateCheckoutInput, CheckoutResult, PaymentMode } from "@/types";
import type { CreateSessionInput } from "@/lib/payment/types";

/**
 * Resolve the active Stripe price ID for a product.
 * Looks up ProductPrice records for a date-active price in the current mode.
 */
async function resolveStripePriceId(
  product: {
    id: string;
    name: string;
  },
  mode: PaymentMode,
): Promise<{ priceId: string; amount: number | null }> {
  const activePrice = await productPriceRepository.findActivePrice(
    product.id,
    mode,
  );
  if (activePrice) {
    return { priceId: activePrice.stripePriceId, amount: activePrice.amount };
  }

  throw new Error(
    `Product "${product.name}" has no active Stripe ${mode} price configured. Add a ProductPrice record.`,
  );
}

async function rollbackGuestUser(userId: string, error: unknown): Promise<never> {
  try {
    await userRepository.delete(userId);
  } catch {
    throw new Error(
      "Checkout user provisioning failed and cleanup could not complete.",
    );
  }
  throw error;
}

export const checkoutService = {
  async createSession(
    input: CreateCheckoutInput,
    userId?: string,
  ): Promise<CheckoutResult> {
    if (!input.items.length) {
      throw new Error("Cart is empty.");
    }

    if (userId && !(await hasActiveCurrentTenantMembership(userId))) {
      throw new Error("User is not available for this tenant.");
    }

    const config = await getPaymentConfig();
    if (!config.secretKey) {
      throw new Error("Payment is not configured. Contact the administrator.");
    }

    // Product and price repositories apply verified tenant filters when request
    // scope carries an authoritative tenant.
    const products = await Promise.all(
      input.items.map(async (item) => {
        const product = await productRepository.findById(item.productId);
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        if (!product.isActive)
          throw new Error(`Product "${product.name}" is no longer available.`);
        return { ...product, quantity: item.quantity };
      }),
    );

    const hasRecurring = products.some((p) => p.paymentModel === "recurring");
    const mode: "payment" | "subscription" = hasRecurring
      ? "subscription"
      : "payment";

    const lineItems = await Promise.all(
      products.map(async (product) => {
        const resolved = await resolveStripePriceId(product, config.mode);
        return {
          priceId: resolved.priceId,
          quantity: product.quantity,
          productId: product.id,
        };
      }),
    );

    const metadata: Record<string, string> = {
      internalItems: JSON.stringify(
        products.map((p) => ({
          productId: p.id,
          quantity: p.quantity,
          amount: p.price,
          currency: p.currency,
        })),
      ),
    };
    if (userId) metadata.userId = userId;

    const provider = getPaymentProvider(config.provider);

    const sessionInput: CreateSessionInput = {
      lineItems,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      mode,
      metadata,
    };

    if (!userId && input.guestEmail) {
      sessionInput.customerEmail = input.guestEmail;
    }

    if (userId) {
      const user = await userRepository.findById(userId);
      if (!user) throw new Error("User is not available for this tenant.");

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        customerId = await provider.findOrCreateCustomer(
          user.email,
          user.name,
          config,
        );
        await userRepository.update(userId, { stripeCustomerId: customerId });
      }
      sessionInput.customerEmail = undefined;
      sessionInput.metadata = {
        ...sessionInput.metadata,
        stripeCustomerId: customerId,
      };
      sessionInput.customerId = customerId;
    }

    const result = await provider.createCheckoutSession(sessionInput, config);

    await checkoutRepository.create({
      sessionId: result.sessionId,
      userId: userId || undefined,
      guestEmail: input.guestEmail,
      guestName: input.guestName,
      items: input.items,
      provider: config.provider,
    });

    return result;
  },

  async verifySession(sessionId: string) {
    const checkoutSession = await checkoutRepository.findBySessionId(sessionId);
    if (!checkoutSession) {
      throw new Error("Checkout session not found.");
    }

    if (checkoutSession.status === "completed") {
      throw new Error("This checkout session has already been processed.");
    }

    const config = await getPaymentConfig();
    const provider = getPaymentProvider(config.provider);
    const verified = await provider.verifySession(sessionId, config);

    if (verified.paymentStatus !== "paid") {
      throw new Error("Payment has not been completed.");
    }

    const workspace = await resolveCurrentTenantWorkspace();
    let userId = checkoutSession.userId;
    let createdUser = null;

    if (userId) {
      if (!(await hasActiveCurrentTenantMembership(userId))) {
        throw new Error("Checkout user is not available for this tenant.");
      }
    } else {
      const email = (verified.customerEmail ?? checkoutSession.guestEmail ?? "")
        .toLowerCase()
        .trim();
      if (!email) {
        throw new Error("No email associated with this checkout.");
      }

      const existingUser = await userRepository.findByEmailWithPassword(email);
      if (existingUser) {
        userId = existingUser.id;

        // A paid checkout is an explicit tenant transaction. Recover a missing
        // same-tenant membership (for example after an interrupted first verify)
        // but the helper refuses users staged to another tenant.
        if (!(await hasActiveCurrentTenantMembership(userId))) {
          await provisionNewUserTenantMembership(userId, workspace);
        }
      } else {
        const randomPassword = crypto.randomBytes(24).toString("base64url");
        const passwordHash = hashPassword(randomPassword);
        const name =
          verified.customerName ||
          checkoutSession.guestName ||
          email.split("@")[0];

        const newUser = await userRepository.create({
          name,
          email,
          passwordHash,
          status: "active",
        });
        userId = newUser.id;

        try {
          await provisionNewUserTenantMembership(newUser.id, workspace);
        } catch (error) {
          return rollbackGuestUser(newUser.id, error);
        }

        createdUser = {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        };
      }
    }

    const items = checkoutSession.items as {
      productId: string;
      quantity: number;
    }[];
    const purchases = [];

    if (verified.customerId) {
      await userRepository.update(userId, {
        stripeCustomerId: verified.customerId,
      });
    }

    for (const item of items) {
      const externalId =
        verified.subscriptionId || verified.paymentIntentId || sessionId;

      const purchase = await purchaseService.create(userId, item.productId, {
        externalId,
      });
      purchases.push(purchase);
    }

    await checkoutRepository.updateStatus(checkoutSession.id, "completed");

    return {
      purchases: purchases.map((p) => ({
        id: p.id,
        productId: p.productId,
        amount: p.amount,
        status: p.status,
        product: p.product ? { name: p.product.name } : undefined,
      })),
      user: createdUser || undefined,
    };
  },
};
