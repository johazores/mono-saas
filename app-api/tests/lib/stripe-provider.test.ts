import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeProvider } from "@/lib/payment/stripe-provider";
import type { PaymentConfig } from "@/types";

const config: PaymentConfig = {
  provider: "stripe",
  mode: "test",
  publicKey: "pk_test_public",
  secretKey: "sk_test_private",
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stripeProvider billing mapping", () => {
  it("maps Stripe subscriptions to provider-neutral records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "sub_123",
            status: "active",
            current_period_end: 1_800_000_000,
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: {
                    id: "price_123",
                    product: "prod_123",
                    recurring: { interval: "month" },
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      stripeProvider.getCustomerSubscriptions("cus_123", config),
    ).resolves.toEqual([
      {
        id: "sub_123",
        status: "active",
        currentPeriodEnd: 1_800_000_000,
        cancelAtPeriodEnd: false,
        interval: "month",
        items: [{ priceId: "price_123", productId: "prod_123" }],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/subscriptions?customer=cus_123"),
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer sk_test_private" },
      }),
    );
  });

  it("maps Stripe invoices without leaking Stripe-named fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "in_123",
            status: "paid",
            amount_paid: 2599,
            currency: "usd",
            subscription: "sub_123",
            payment_intent: "pi_123",
            lines: {
              data: [
                {
                  price: {
                    id: "price_123",
                    product: "prod_123",
                  },
                },
              ],
            },
            period_start: 1_700_000_000,
            period_end: 1_702_592_000,
            hosted_invoice_url: "https://billing.example/invoice",
            invoice_pdf: "https://billing.example/invoice.pdf",
            created: 1_700_000_100,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await stripeProvider.getCustomerInvoices(
      "cus_123",
      config,
    );

    expect(invoices).toEqual([
      {
        id: "in_123",
        status: "paid",
        amountPaid: 25.99,
        currency: "USD",
        subscriptionId: "sub_123",
        paymentId: "pi_123",
        productId: "prod_123",
        priceId: "price_123",
        periodStart: 1_700_000_000,
        periodEnd: 1_702_592_000,
        hostedUrl: "https://billing.example/invoice",
        pdfUrl: "https://billing.example/invoice.pdf",
        created: 1_700_000_100,
      },
    ]);
    expect(invoices[0]).not.toHaveProperty("stripeProductId");
    expect(invoices[0]).not.toHaveProperty("stripePriceId");
  });
});
