import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    purchase: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    purchaseFile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import { productRepository } from "@/repositories/product-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { purchaseFileRepository } from "@/repositories/purchase-file-repository";

const tenant = vi.mocked(getTenantId);
const env = vi.mocked(getAppEnv);
const products = vi.mocked(prisma.product);
const purchases = vi.mocked(prisma.purchase);
const files = vi.mocked(prisma.purchaseFile);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
  env.mockResolvedValue("dev");
});

describe("productRepository staged tenant filters", () => {
  it("filters public product listings when a tenant is verified", async () => {
    tenant.mockReturnValue("tenant-1");
    products.findMany.mockResolvedValue([] as never);

    await productRepository.list();

    expect(products.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  });

  it("uses a tenant-qualified id lookup when context exists", async () => {
    tenant.mockReturnValue("tenant-1");
    products.findFirst.mockResolvedValue(null);

    await productRepository.findById("product-1");

    expect(products.findFirst).toHaveBeenCalledWith({
      where: { id: "product-1", tenantId: "tenant-1" },
    });
    expect(products.findUnique).not.toHaveBeenCalled();
  });

  it("preserves the legacy unique lookup without tenant context", async () => {
    products.findUnique.mockResolvedValue(null);

    await productRepository.findById("product-1");

    expect(products.findUnique).toHaveBeenCalledWith({
      where: { id: "product-1" },
    });
  });
});

describe("purchaseRepository staged tenant filters", () => {
  it("filters member purchase history by verified tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    purchases.findMany.mockResolvedValue([] as never);

    await purchaseRepository.findByUserId("user-1");

    expect(purchases.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", userId: "user-1" },
      }),
    );
  });

  it("filters ownership checks by verified tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    purchases.findFirst.mockResolvedValue(null);

    await purchaseRepository.checkOwnership("user-1", "product-1");

    expect(purchases.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        userId: "user-1",
        productId: "product-1",
        status: { in: ["completed", "active"] },
      },
    });
  });

  it("preserves deployment-only purchase history behavior", async () => {
    purchases.findMany.mockResolvedValue([] as never);

    await purchaseRepository.findByUserId("user-1");

    expect(purchases.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });
});

describe("purchaseFileRepository staged tenant filters", () => {
  it("uses a tenant-qualified file lookup when context exists", async () => {
    tenant.mockReturnValue("tenant-1");
    files.findFirst.mockResolvedValue(null);

    await purchaseFileRepository.findById("file-1");

    expect(files.findFirst).toHaveBeenCalledWith({
      where: { id: "file-1", tenantId: "tenant-1" },
    });
    expect(files.findUnique).not.toHaveBeenCalled();
  });

  it("filters file lists by verified tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    files.findMany.mockResolvedValue([] as never);

    await purchaseFileRepository.findByPurchaseIds(["purchase-1"]);

    expect(files.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        purchaseId: { in: ["purchase-1"] },
      },
      orderBy: { createdAt: "asc" },
    });
  });
});
