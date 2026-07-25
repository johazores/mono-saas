import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/product-repository", () => ({
  productRepository: {
    list: vi.fn(),
    listAll: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countActivePurchases: vi.fn(),
  },
}));
vi.mock("@/services/product-price-service", () => ({
  productPriceService: {
    create: vi.fn(),
  },
}));

import { productRepository } from "@/repositories/product-repository";
import { productPriceService } from "@/services/product-price-service";
import { productService } from "@/services/product-service";

const repo = vi.mocked(productRepository);
const prices = vi.mocked(productPriceService);

beforeEach(() => {
  vi.clearAllMocks();
  repo.findBySlug.mockResolvedValue(null as never);
  repo.create.mockResolvedValue({
    id: "product-1",
    name: "Pro Plan",
    slug: "pro-plan",
  } as never);
});

describe("productService embedded price contract", () => {
  it("forwards already-typed embedded price values without coercion", async () => {
    await productService.create({
      name: "Pro Plan",
      slug: "pro-plan",
      prices: [
        {
          label: "Monthly",
          stripePriceId: "price_123",
          mode: "live",
          amount: 19.99,
          currency: "USD",
          interval: "month",
          startDate: "2026-07-25",
          endDate: "2026-08-25",
          isDefault: true,
          stripeProductId: "prod_123",
        },
      ],
    });

    expect(prices.create).toHaveBeenCalledWith({
      productId: "product-1",
      label: "Monthly",
      stripePriceId: "price_123",
      mode: "live",
      amount: 19.99,
      currency: "USD",
      interval: "month",
      startDate: "2026-07-25",
      endDate: "2026-08-25",
      isDefault: true,
      stripeProductId: "prod_123",
    });
  });
});
