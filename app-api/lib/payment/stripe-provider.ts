import type { PaymentConfig } from "@/types";
import type {
  PaymentProviderInterface,
  CreateSessionInput,
  CreateSessionResult,
  VerifiedSession,
  BillingPortalResult,
  ProviderSubscription,
  ProviderInvoice,
} from "./types";
import type {
  StripeSessionResponse,
  StripeLineItemsResponse,
  StripeSubscriptionResponse,
  StripeInvoiceResponse,
  StripeListResponse,
} from "./stripe-types";

const STRIPE_API = "https://api.stripe.com/v1";

function encodeForm(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

async function stripeRequest<T>(
  path: string,
  secretKey: string,
  body?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  const options: RequestInit = { method: body ? "POST" : "GET", headers };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = encodeForm(body);
  }

  const response = await fetch(`${STRIPE_API}${path}`, options);
  const json = await response.json();

  if (!response.ok) {
    const message =
      json?.error?.message ?? `Stripe API error: ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export const stripeProvider: PaymentProviderInterface = {
  async createCheckoutSession(
    input: CreateSessionInput,
    config: PaymentConfig,
  ): Promise<CreateSessionResult> {
    const body: Record<string, string> = {
      mode: input.mode,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    };

    input.lineItems.forEach((item, index) => {
      body[`line_items[${index}][price]`] = item.priceId;
      body[`line_items[${index}][quantity]`] = String(item.quantity);
    });

    if (input.customerId) {
      body.customer = input.customerId;
    } else if (input.customerEmail) {
      body.customer_email = input.customerEmail;
    }

    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        body[`metadata[${key}]`] = value;
      }
    }

    const session = await stripeRequest<StripeSessionResponse>(
      "/checkout/sessions",
      config.secretKey,
      body,
    );

    return {
      sessionId: session.id,
      redirectUrl: session.url,
    };
  },

  async verifySession(
    sessionId: string,
    config: PaymentConfig,
  ): Promise<VerifiedSession> {
    const session = await stripeRequest<StripeSessionResponse>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      config.secretKey,
    );
    const items = await stripeRequest<StripeLineItemsResponse>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}/line_items`,
      config.secretKey,
    );

    return {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      customerId: session.customer ?? null,
      customerEmail:
        session.customer_details?.email ?? session.customer_email ?? null,
      customerName: session.customer_details?.name ?? null,
      subscriptionId: session.subscription ?? null,
      paymentIntentId: session.payment_intent ?? null,
      metadata: session.metadata ?? {},
      lineItems: (items.data ?? []).map((item) => ({
        priceId: item.price.id,
        quantity: item.quantity,
      })),
    };
  },

  async findOrCreateCustomer(
    email: string,
    name: string | undefined,
    config: PaymentConfig,
  ): Promise<string> {
    const search = await stripeRequest<{ data: { id: string }[] }>(
      `/customers?email=${encodeURIComponent(email)}&limit=1`,
      config.secretKey,
    );

    if (search.data.length > 0) {
      return search.data[0].id;
    }

    const body: Record<string, string> = { email };
    if (name) body.name = name;

    const customer = await stripeRequest<{ id: string }>(
      "/customers",
      config.secretKey,
      body,
    );

    return customer.id;
  },

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
    config: PaymentConfig,
  ): Promise<BillingPortalResult> {
    const session = await stripeRequest<{ url: string }>(
      "/billing_portal/sessions",
      config.secretKey,
      { customer: customerId, return_url: returnUrl },
    );

    return { url: session.url };
  },

  async getCustomerSubscriptions(
    customerId: string,
    config: PaymentConfig,
  ): Promise<ProviderSubscription[]> {
    const result = await stripeRequest<
      StripeListResponse<StripeSubscriptionResponse>
    >(
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
      config.secretKey,
    );

    return result.data.map((subscription) => {
      const firstItem = subscription.items.data[0];
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        interval: firstItem?.price?.recurring?.interval ?? null,
        items: subscription.items.data.map((item) => ({
          priceId: item.price.id,
          productId: item.price.product,
        })),
      };
    });
  },

  async getCustomerInvoices(
    customerId: string,
    config: PaymentConfig,
  ): Promise<ProviderInvoice[]> {
    const result = await stripeRequest<
      StripeListResponse<StripeInvoiceResponse>
    >(
      `/invoices?customer=${encodeURIComponent(customerId)}&limit=50&expand[]=data.lines`,
      config.secretKey,
    );

    return result.data.map((invoice) => {
      const firstLine = invoice.lines?.data?.[0];
      return {
        id: invoice.id,
        status: invoice.status,
        amountPaid: invoice.amount_paid / 100,
        currency: invoice.currency.toUpperCase(),
        subscriptionId: invoice.subscription ?? null,
        paymentId:
          typeof invoice.payment_intent === "string"
            ? invoice.payment_intent
            : null,
        productId:
          typeof firstLine?.price?.product === "string"
            ? firstLine.price.product
            : null,
        priceId: firstLine?.price?.id ?? null,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        hostedUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
        created: invoice.created,
      };
    });
  },
};
