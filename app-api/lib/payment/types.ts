import type {
  PaymentConfig,
  ProviderSubscription,
  ProviderInvoice,
} from "@/types";

export type { ProviderSubscription, ProviderInvoice };

export type ProviderLineItem = {
  priceId: string;
  quantity: number;
  productId: string;
};

export type CreateSessionInput = {
  lineItems: ProviderLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  customerId?: string;
  metadata?: Record<string, string>;
  mode: "payment" | "subscription";
};

export type CreateSessionResult = {
  sessionId: string;
  redirectUrl: string;
};

export type VerifiedSession = {
  sessionId: string;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  metadata: Record<string, string>;
  lineItems: { priceId: string; quantity: number }[];
};

export type BillingPortalResult = {
  url: string;
};

export interface PaymentProviderInterface {
  createCheckoutSession(
    input: CreateSessionInput,
    config: PaymentConfig,
  ): Promise<CreateSessionResult>;

  verifySession(
    sessionId: string,
    config: PaymentConfig,
  ): Promise<VerifiedSession>;

  findOrCreateCustomer(
    email: string,
    name: string | undefined,
    config: PaymentConfig,
  ): Promise<string>;

  createBillingPortalSession(
    customerId: string,
    returnUrl: string,
    config: PaymentConfig,
  ): Promise<BillingPortalResult>;

  getCustomerSubscriptions(
    customerId: string,
    config: PaymentConfig,
  ): Promise<ProviderSubscription[]>;

  getCustomerInvoices(
    customerId: string,
    config: PaymentConfig,
  ): Promise<ProviderInvoice[]>;
}
