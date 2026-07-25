export type ProviderSubscription = {
  id: string;
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  interval: string | null;
  items: { priceId: string; productId: string }[];
};

export type ProviderInvoice = {
  id: string;
  status: string;
  amountPaid: number;
  currency: string;
  subscriptionId: string | null;
  paymentId: string | null;
  productId: string | null;
  priceId: string | null;
  periodStart: number;
  periodEnd: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
  created: number;
};

export type BillingStatus = {
  hasStripeCustomer: boolean;
  portalUrl: string | null;
  subscriptions: ProviderSubscription[];
  invoices: ProviderInvoice[];
  syncedAt: string | null;
};
