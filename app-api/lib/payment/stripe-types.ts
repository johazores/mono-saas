export type StripeSessionResponse = {
  id: string;
  url: string;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  customer: string | null;
  customer_email: string | null;
  customer_details?: { email: string | null; name: string | null };
  subscription: string | null;
  payment_intent: string | null;
  metadata: Record<string, string>;
};

export type StripeLineItemsResponse = {
  data: { price: { id: string }; quantity: number }[];
};

export type StripeProductResponse = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  active: boolean;
  metadata: Record<string, unknown>;
};

export type StripePriceResponse = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
  nickname: string | null;
  type: string;
  active: boolean;
  product: string;
};

export type StripeSubscriptionResponse = {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: {
      price: {
        id: string;
        product: string;
        recurring: { interval: string } | null;
      };
    }[];
  };
};

export type StripeInvoiceResponse = {
  id: string;
  status: string;
  amount_paid: number;
  currency: string;
  subscription: string | null;
  payment_intent: string | null;
  lines: {
    data: {
      price: { id: string; product: string } | null;
    }[];
  };
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created: number;
};

export type StripeListResponse<T> = { data: T[] };
