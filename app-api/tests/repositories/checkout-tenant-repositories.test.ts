import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productPrice: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    checkoutSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import { checkoutRepository } from "@/repositories/checkout-repository";
import { productPriceRepository } from "@/repositories/product-price-repository";

const tenant = vi.mocked(getTenantId);
const prices = vi.mocked(prisma.productPrice);
const checkouts = vi.mocked(prisma.checkoutSession);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
});

describe("product price tenant filters", () => {
  it("filters active price resolution by verified tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    prices.findMany.mockResolvedValue([] as never);

    await productPriceRepository.findActivePrice("product-1", "test");

    expect(prices.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          productId: "product-1",
          mode: "test",
        }),
      }),
    );
  });

  it("uses a tenant-qualified price id lookup when context exists", async () => {
    tenant.mockReturnValue("tenant-1");
    prices.findFirst.mockResolvedValue(null);

    await productPriceRepository.findById("price-1");

    expect(prices.findFirst).toHaveBeenCalledWith({
      where: { id: "price-1", tenantId: "tenant-1" },
    });
    expect(prices.findUnique).not.toHaveBeenCalled();
  });

  it("preserves deployment-only price lookup behavior", async () => {
    prices.findUnique.mockResolvedValue(null);

    await productPriceRepository.findById("price-1");

    expect(prices.findUnique).toHaveBeenCalledWith({ where: { id: "price-1" } });
  });
});

describe("checkout session tenant filters", () => {
  it("uses a tenant-qualified session lookup when context exists", async () => {
    tenant.mockReturnValue("tenant-1");
    checkouts.findFirst.mockResolvedValue(null);

    await checkoutRepository.findBySessionId("cs_123");

    expect(checkouts.findFirst).toHaveBeenCalledWith({
      where: { sessionId: "cs_123", tenantId: "tenant-1" },
    });
    expect(checkouts.findUnique).not.toHaveBeenCalled();
  });

  it("updates only the verified tenant checkout session", async () => {
    tenant.mockReturnValue("tenant-1");
    checkouts.updateMany.mockResolvedValue({ count: 1 });

    await checkoutRepository.updateStatus("checkout-1", "completed");

    expect(checkouts.updateMany).toHaveBeenCalledWith({
      where: { id: "checkout-1", tenantId: "tenant-1" },
      data: { status: "completed" },
    });
    expect(checkouts.update).not.toHaveBeenCalled();
  });

  it("preserves deployment-only session lookup behavior", async () => {
    checkouts.findUnique.mockResolvedValue(null);

    await checkoutRepository.findBySessionId("cs_123");

    expect(checkouts.findUnique).toHaveBeenCalledWith({
      where: { sessionId: "cs_123" },
    });
  });
});
