import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    page: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contentType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contentItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    blockTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import { pageRepository } from "@/repositories/page-repository";
import { contentTypeRepository } from "@/repositories/content-type-repository";
import { contentItemRepository } from "@/repositories/content-item-repository";
import { blockTemplateRepository } from "@/repositories/block-template-repository";

const tenant = vi.mocked(getTenantId);
const pages = vi.mocked(prisma.page);
const contentTypes = vi.mocked(prisma.contentType);
const contentItems = vi.mocked(prisma.contentItem);
const blockTemplates = vi.mocked(prisma.blockTemplate);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
});

describe("public CMS tenant reads", () => {
  it("qualifies published pages, page slugs, and homepage by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    pages.findMany.mockResolvedValue([]);
    pages.findFirst.mockResolvedValue(null);

    await pageRepository.listPublished();
    await pageRepository.findBySlug("about");
    await pageRepository.findHomepage();

    expect(pages.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "published" },
      orderBy: { title: "asc" },
    });
    expect(pages.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", slug: "about" },
    });
    expect(pages.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        isHomepage: true,
        status: "published",
      },
    });
  });

  it("qualifies public content type and content item reads by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    contentTypes.findFirst.mockResolvedValue(null);
    contentItems.findMany.mockResolvedValue([]);
    contentItems.findFirst.mockResolvedValue(null);

    await contentTypeRepository.findBySlug("blog");
    await contentItemRepository.listPublishedByType("blog");
    await contentItemRepository.findBySlug("blog", "hello-world");

    expect(contentTypes.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", slug: "blog" },
    });
    expect(contentItems.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        contentTypeSlug: "blog",
        status: "published",
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    expect(contentItems.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        contentTypeSlug: "blog",
        slug: "hello-world",
      },
    });
  });

  it("qualifies active public block templates by tenant", async () => {
    tenant.mockReturnValue("tenant-1");
    blockTemplates.findMany.mockResolvedValue([]);

    await blockTemplateRepository.listActive();

    expect(blockTemplates.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "active" },
      orderBy: { sortOrder: "asc" },
    });
  });

  it("preserves deployment-only public reads without tenant context", async () => {
    pages.findFirst.mockResolvedValue(null);
    contentTypes.findFirst.mockResolvedValue(null);
    contentItems.findFirst.mockResolvedValue(null);
    blockTemplates.findMany.mockResolvedValue([]);

    await pageRepository.findBySlug("about");
    await contentTypeRepository.findBySlug("blog");
    await contentItemRepository.findBySlug("blog", "hello-world");
    await blockTemplateRepository.listActive();

    expect(pages.findFirst).toHaveBeenCalledWith({ where: { slug: "about" } });
    expect(contentTypes.findFirst).toHaveBeenCalledWith({ where: { slug: "blog" } });
    expect(contentItems.findFirst).toHaveBeenCalledWith({
      where: { contentTypeSlug: "blog", slug: "hello-world" },
    });
    expect(blockTemplates.findMany).toHaveBeenCalledWith({
      where: { status: "active" },
      orderBy: { sortOrder: "asc" },
    });
  });
});
