import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({ verifyCsrf: vi.fn(() => true) }));
vi.mock("@/lib/user-auth", () => ({ getUserSession: vi.fn() }));
vi.mock("@/services/checkout-service", () => ({
  checkoutService: {
    createSession: vi.fn(),
    verifySession: vi.fn(),
  },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));

import {
  checkoutController,
  checkoutVerifyController,
} from "@/controllers/checkout-controller";
import { checkoutService } from "@/services/checkout-service";

const checkout = vi.mocked(checkoutService);

function request(body: unknown): NextApiRequest {
  return {
    method: "POST",
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const json = vi.fn();
  const end = vi.fn();
  const setHeader = vi.fn();
  const res = {
    status: vi.fn(),
    json,
    end,
    setHeader,
  } as unknown as NextApiResponse;
  vi.mocked(res.status).mockReturnValue(res);
  return { res, json };
}

beforeEach(() => vi.clearAllMocks());

describe("checkout request validation", () => {
  it("stops before checkout service for malformed line items", async () => {
    const { res, json } = response();

    await checkoutController(
      request({
        items: [{ productId: "product-id", quantity: "1" }],
        successUrl: "/success",
        cancelUrl: "/cancel",
      }),
      res,
    );

    expect(checkout.createSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid request.",
        details: {
          fields: expect.objectContaining({
            "items.0.quantity": expect.any(Array),
          }),
        },
      }),
    );
  });

  it("passes normalized checkout data to the service", async () => {
    checkout.createSession.mockResolvedValue({
      sessionId: "session-id",
      redirectUrl: "https://checkout.example.com",
    });
    const { res } = response();

    await checkoutController(
      request({
        items: [{ productId: " product-id ", quantity: 2 }],
        successUrl: " /success ",
        cancelUrl: " /cancel ",
        ignored: "not forwarded",
      }),
      res,
    );

    expect(checkout.createSession).toHaveBeenCalledWith(
      {
        items: [{ productId: "product-id", quantity: 2 }],
        successUrl: "/success",
        cancelUrl: "/cancel",
      },
      undefined,
    );
  });

  it("stops verification before the payment service when sessionId is missing", async () => {
    const { res } = response();

    await checkoutVerifyController(request({ sessionId: "" }), res);

    expect(checkout.verifySession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
