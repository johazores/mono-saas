import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    purchase: { count: vi.fn() },
  },
}));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import { getAppEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import { productRepository } from "@/repositories/product-repository";

const env = vi.mocked(getAppEnv);
const tenant = vi.mocked(getTenantId);
const products = vi.mocked(prisma.product);

beforeEach(() => {
  vi.clearAllMocks();
  env.mockResolvedValue("dev");
  tenant.mockReturnValue(null);
});

describe("productRepository.findBySlug staged tenant consistency", () => {
  const product = {
    id: "product-1",
    env: "dev",
    tenantId: "tenant-a",
    slug: "free",
  };

  it("preserves the legacy env lookup when no tenant is bound", async () => {
    products.findUnique.mockResolvedValue(product as never);

    await expect(productRepository.findBySlug("free")).resolves.toEqual(product);
    expect(products.findUnique).toHaveBeenCalledWith({
      where: { env_slug: { env: "dev", slug: "free" } },
    });
  });

  it("returns the product when its staged tenant matches verified context", async () => {
    tenant.mockReturnValue("tenant-a");
    products.findUnique.mockResolvedValue(product as never);

    await expect(productRepository.findBySlug("free")).resolves.toEqual(product);
  });

  it("refuses a product staged to another tenant", async () => {
    tenant.mockReturnValue("tenant-b");
    products.findUnique.mockResolvedValue(product as never);

    await expect(productRepository.findBySlug("free")).resolves.toBeNull();
  });

  it("returns null normally when the legacy lookup has no product", async () => {
    tenant.mockReturnValue("tenant-a");
    products.findUnique.mockResolvedValue(null);

    await expect(productRepository.findBySlug("missing")).resolves.toBeNull();
  });
});
