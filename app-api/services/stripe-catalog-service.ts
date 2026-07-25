import { getPaymentConfig } from "@/lib/payment";
import type {
  StripeProductResponse,
  StripePriceResponse,
  StripeListResponse,
} from "@/lib/payment/stripe-types";
import type {
  StripeProductListResult,
  StripeProductDetailResult,
  StripePriceLookup,
} from "@/types";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeGet<T>(path: string, secretKey: string): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await response.json();

  if (!response.ok) {
    const message =
      json?.error?.message ?? `Stripe API error: ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

async function requireConfig() {
  const config = await getPaymentConfig();
  if (!config.secretKey) {
    throw new Error(
      "Payment is not configured. Set the Stripe secret key in Settings.",
    );
  }
  return config;
}

async function listProducts(): Promise<StripeProductListResult> {
  const config = await requireConfig();
  const data = await stripeGet<StripeListResponse<StripeProductResponse>>(
    "/products?active=true&limit=100",
    config.secretKey,
  );

  const items = (data.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    images: product.images ?? [],
    active: product.active,
    metadata: product.metadata ?? {},
  }));

  return { items, mode: config.mode };
}

async function getProduct(
  productId: string,
): Promise<StripeProductDetailResult> {
  const config = await requireConfig();

  const [productData, pricesData] = await Promise.all([
    stripeGet<StripeProductResponse>(
      `/products/${encodeURIComponent(productId)}`,
      config.secretKey,
    ),
    stripeGet<StripeListResponse<StripePriceResponse>>(
      `/prices?product=${encodeURIComponent(productId)}&active=true&limit=100`,
      config.secretKey,
    ),
  ]);

  const product = {
    id: productData.id,
    name: productData.name,
    description: productData.description ?? null,
    images: productData.images ?? [],
    active: productData.active,
    metadata: productData.metadata ?? {},
  };

  const prices = (pricesData.data ?? []).map((price) => ({
    id: price.id,
    amount: typeof price.unit_amount === "number" ? price.unit_amount / 100 : 0,
    currency: (price.currency ?? "usd").toUpperCase(),
    interval: price.recurring?.interval ?? null,
    nickname: price.nickname ?? null,
    type: price.type,
    active: price.active,
  }));

  return { product, prices, mode: config.mode };
}

async function getPrice(priceId: string): Promise<StripePriceLookup> {
  const config = await requireConfig();

  const data = await stripeGet<StripePriceResponse>(
    `/prices/${encodeURIComponent(priceId)}`,
    config.secretKey,
  );

  return {
    stripePriceId: data.id,
    stripeProductId: data.product,
    amount: typeof data.unit_amount === "number" ? data.unit_amount / 100 : 0,
    currency: (data.currency ?? "usd").toUpperCase(),
    interval: data.recurring?.interval ?? null,
    label: data.nickname ?? "",
    mode: config.mode,
    active: data.active,
  };
}

export const stripeCatalogService = { listProducts, getProduct, getPrice };
