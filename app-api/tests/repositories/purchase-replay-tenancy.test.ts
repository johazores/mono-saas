import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchase: {
      findFirst: mocks.findFirst,
    },
  },
}));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import { getTenantId } from "@/lib/request-scope";
import { purchaseRepository } from "@/repositories/purchase-repository";

const tenant = vi.mocked(getTenantId);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
  mocks.findFirst.mockResolvedValue(null);
});

describe("purchase replay tenant lookup", () => {
  it("qualifies user/product/provider replay by verified tenant", async () => {
    tenant.mockReturnValue("tenant-a");

    await purchaseRepository.findByExternalIdForUserProduct(
      "user-1",
      "product-1",
      "sub_123",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        userId: "user-1",
        productId: "product-1",
        externalId: "sub_123",
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            price: true,
            accessKeys: true,
            maxSubUsers: true,
          },
        },
      },
    });
  });

  it("preserves deployment-only replay lookup", async () => {
    await purchaseRepository.findByExternalIdForUserProduct(
      "user-1",
      "product-1",
      "sub_123",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          productId: "product-1",
          externalId: "sub_123",
        },
      }),
    );
  });
});
