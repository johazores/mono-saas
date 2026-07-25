import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/csrf", () => ({
  verifyCsrf: vi.fn(),
}));
vi.mock("@/services/product-service", () => ({
  productService: {
    listAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

import { requireAdmin } from "@/lib/admin-auth";
import { verifyCsrf } from "@/lib/csrf";
import { logActivity } from "@/lib/activity-logger";
import {
  productCollectionController,
  productItemController,
} from "@/controllers/product-controller";
import { productService } from "@/services/product-service";

const auth = vi.mocked(requireAdmin);
const csrf = vi.mocked(verifyCsrf);
const products = vi.mocked(productService);
const activity = vi.mocked(logActivity);

function request(
  method: string,
  body: unknown,
  query: Record<string, string> = {},
): NextApiRequest {
  return {
    method,
    body,
    query,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  return { res, status, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    admin: {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    },
  } as never);
  csrf.mockReturnValue(true);
});

describe("productCollectionController validation", () => {
  it("rejects missing required product fields before service calls", async () => {
    const { res, status, json } = response();

    await productCollectionController(
      request("POST", { price: 10 }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Invalid request.",
      details: {
        fields: expect.objectContaining({
          name: expect.any(Array),
          slug: expect.any(Array),
        }),
      },
    });
    expect(products.create).not.toHaveBeenCalled();
  });

  it("does not coerce a product price string into a number", async () => {
    const { res, status, json } = response();

    await productCollectionController(
      request("POST", {
        name: "Product",
        slug: "product",
        price: "19.99",
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            price: expect.any(Array),
          }),
        },
      }),
    );
    expect(products.create).not.toHaveBeenCalled();
  });

  it("rejects string amounts inside embedded prices", async () => {
    const { res, status, json } = response();

    await productCollectionController(
      request("POST", {
        name: "Product",
        slug: "product",
        prices: [{ amount: "12.50" }],
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            "prices.0.amount": expect.any(Array),
          }),
        },
      }),
    );
    expect(products.create).not.toHaveBeenCalled();
  });

  it("passes normalized typed product input and strips unknown fields", async () => {
    products.create.mockResolvedValue({
      id: "product-1",
      name: "Pro Plan",
    } as never);
    const { res, status } = response();

    await productCollectionController(
      request("POST", {
        name: "  Pro Plan  ",
        slug: "  Pro-Plan  ",
        currency: " usd ",
        accessKeys: [" downloads ", "members"],
        metadata: { source: "admin" },
        prices: [
          {
            label: " Monthly ",
            stripePriceId: " price_123 ",
            amount: 19.99,
          },
        ],
        unexpected: "drop-me",
      }),
      res,
    );

    expect(products.create).toHaveBeenCalledWith({
      name: "Pro Plan",
      slug: "Pro-Plan",
      currency: "usd",
      accessKeys: ["downloads", "members"],
      metadata: { source: "admin" },
      prices: [
        {
          label: "Monthly",
          stripePriceId: "price_123",
          mode: "test",
          amount: 19.99,
          currency: "USD",
          isDefault: false,
        },
      ],
    });
    expect(activity).toHaveBeenCalledWith(
      expect.anything(),
      "product.create",
      expect.objectContaining({
        actorId: "admin-1",
        resourceId: "product-1",
      }),
    );
    expect(status).toHaveBeenCalledWith(201);
  });
});

describe("productItemController validation", () => {
  it("rejects invalid update enum values before the service", async () => {
    const { res, status } = response();

    await productItemController(
      request("PUT", { paymentModel: "sometimes" }, { id: "product-1" }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(products.update).not.toHaveBeenCalled();
  });

  it("normalizes a valid update and strips unknown fields", async () => {
    products.update.mockResolvedValue({
      id: "product-1",
      name: "Updated Product",
    } as never);
    const { res, status } = response();

    await productItemController(
      request(
        "PUT",
        {
          name: "  Updated Product  ",
          price: 25,
          isActive: true,
          unexpected: "drop-me",
        },
        { id: "product-1" },
      ),
      res,
    );

    expect(products.update).toHaveBeenCalledWith("product-1", {
      name: "Updated Product",
      price: 25,
      isActive: true,
    });
    expect(activity).toHaveBeenCalledWith(
      expect.anything(),
      "product.update",
      expect.objectContaining({
        actorId: "admin-1",
        resourceId: "product-1",
      }),
    );
    expect(status).toHaveBeenCalledWith(200);
  });
});
