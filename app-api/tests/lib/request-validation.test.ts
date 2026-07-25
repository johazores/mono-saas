import { describe, expect, it, vi } from "vitest";
import type { NextApiResponse } from "next";
import { parseRequestBody } from "@/lib/request-validation";
import {
  checkoutRequestSchema,
  loginRequestSchema,
  registrationRequestSchema,
} from "@/lib/request-schemas";

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    res: { status } as unknown as NextApiResponse,
    status,
    json,
  };
}

describe("parseRequestBody", () => {
  it("returns normalized typed data on success", () => {
    const { res, status } = response();

    const result = parseRequestBody(res, loginRequestSchema, {
      email: "  user@example.com ",
      password: "Password1",
    });

    expect(result).toEqual({
      email: "user@example.com",
      password: "Password1",
    });
    expect(status).not.toHaveBeenCalled();
  });

  it("returns 400 with field-level issue details", () => {
    const { res, status, json } = response();

    const result = parseRequestBody(res, registrationRequestSchema, {
      name: "",
      email: "not-an-email",
      password: "weak",
    });

    expect(result).toBeNull();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Invalid request.",
      details: {
        fields: expect.objectContaining({
          name: expect.any(Array),
          email: expect.any(Array),
          password: expect.any(Array),
        }),
      },
    });
  });

  it("preserves nested array paths for checkout errors", () => {
    const { res, json } = response();

    parseRequestBody(res, checkoutRequestSchema, {
      items: [{ productId: "", quantity: 0 }],
      successUrl: "",
      cancelUrl: "/cancel",
    });

    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Invalid request.",
      details: {
        fields: expect.objectContaining({
          "items.0.productId": expect.any(Array),
          "items.0.quantity": expect.any(Array),
          successUrl: expect.any(Array),
        }),
      },
    });
  });

  it("rejects non-numeric checkout quantities instead of coercing strings", () => {
    const { res, json } = response();

    const result = parseRequestBody(res, checkoutRequestSchema, {
      items: [{ productId: "product-id", quantity: "1" }],
      successUrl: "/success",
      cancelUrl: "/cancel",
    });

    expect(result).toBeNull();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            "items.0.quantity": expect.any(Array),
          }),
        },
      }),
    );
  });
});
