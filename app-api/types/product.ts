export type ProductType = "physical" | "digital" | "membership";
export type PaymentModel = "one-time" | "recurring";

export type ProductRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: ProductType;
  price: number;
  currency: string;
  paymentModel: PaymentModel;
  maxSubUsers: number;
  accessKeys: string[];
  stripeTestProductId: string | null;
  stripeLiveProductId: string | null;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProductInput = {
  name: string;
  slug: string;
  description?: string;
  type?: ProductType;
  price?: number;
  currency?: string;
  paymentModel?: PaymentModel;
  maxSubUsers?: number;
  accessKeys?: string[];
  stripeTestProductId?: string;
  stripeLiveProductId?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type EmbeddedProductPriceInput = {
  label: string;
  stripePriceId: string;
  mode: "test" | "live";
  amount: number;
  currency: string;
  interval?: string;
  startDate?: string;
  endDate?: string;
  isDefault: boolean;
  stripeProductId?: string;
};

export type CreateProductWithPricesInput = CreateProductInput & {
  prices?: EmbeddedProductPriceInput[];
};

export type UpdateProductInput = {
  name?: string;
  slug?: string;
  description?: string;
  type?: ProductType;
  price?: number;
  currency?: string;
  paymentModel?: PaymentModel;
  maxSubUsers?: number;
  accessKeys?: string[];
  stripeTestProductId?: string;
  stripeLiveProductId?: string;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};
