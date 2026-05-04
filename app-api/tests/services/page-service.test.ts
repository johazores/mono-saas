import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/repositories/page-repository", () => ({
  pageRepository: {
    list: vi.fn(),
    listPublished: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findHomepage: vi.fn(),
    unsetAllHomepages: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { pageService } from "@/services/page-service";
import { pageRepository } from "@/repositories/page-repository";

const repo = vi.mocked(pageRepository);

describe("pageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getHomepage", () => {
    it("delegates to repository findHomepage", async () => {
      const mockPage = { id: "p1", title: "Home", slug: "home", isHomepage: true };
      repo.findHomepage.mockResolvedValue(mockPage as never);

      const result = await pageService.getHomepage();
      expect(result).toEqual(mockPage);
      expect(repo.findHomepage).toHaveBeenCalledOnce();
    });

    it("returns null when no homepage is set", async () => {
      repo.findHomepage.mockResolvedValue(null);

      const result = await pageService.getHomepage();
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("creates a page with basic fields", async () => {
      const input = { title: "About", slug: "about" };
      repo.create.mockResolvedValue({ id: "p2", ...input } as never);

      const result = await pageService.create(input);
      expect(result).toHaveProperty("id", "p2");
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "About", slug: "about", status: "draft", isHomepage: false }),
      );
    });

    it("throws if title is missing", async () => {
      await expect(pageService.create({ title: "", slug: "test" })).rejects.toThrow("Title is required");
    });

    it("throws if slug is missing", async () => {
      await expect(pageService.create({ title: "Test", slug: "" })).rejects.toThrow("Slug is required");
    });

    it("unsets existing homepages when creating a new homepage", async () => {
      const input = { title: "Home", slug: "home", isHomepage: true };
      repo.unsetAllHomepages.mockResolvedValue(undefined as never);
      repo.create.mockResolvedValue({ id: "p3", ...input } as never);

      await pageService.create(input);
      expect(repo.unsetAllHomepages).toHaveBeenCalledOnce();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isHomepage: true }),
      );
    });

    it("does not unset homepages when isHomepage is false", async () => {
      const input = { title: "About", slug: "about", isHomepage: false };
      repo.create.mockResolvedValue({ id: "p4", ...input } as never);

      await pageService.create(input);
      expect(repo.unsetAllHomepages).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates a page without touching isHomepage when not provided", async () => {
      const input = { title: "About Updated", slug: "about", status: "published" };
      repo.update.mockResolvedValue({ id: "p2", ...input } as never);

      await pageService.update("p2", input);
      expect(repo.update).toHaveBeenCalledWith(
        "p2",
        expect.not.objectContaining({ isHomepage: expect.anything() }),
      );
    });

    it("unsets existing homepages when setting isHomepage true", async () => {
      const input = { title: "Home", slug: "home", isHomepage: true };
      repo.unsetAllHomepages.mockResolvedValue(undefined as never);
      repo.update.mockResolvedValue({ id: "p1", ...input } as never);

      await pageService.update("p1", input);
      expect(repo.unsetAllHomepages).toHaveBeenCalledOnce();
      expect(repo.update).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ isHomepage: true }),
      );
    });

    it("passes isHomepage false without unsetting others", async () => {
      const input = { title: "About", slug: "about", isHomepage: false };
      repo.update.mockResolvedValue({ id: "p2", ...input } as never);

      await pageService.update("p2", input);
      expect(repo.unsetAllHomepages).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(
        "p2",
        expect.objectContaining({ isHomepage: false }),
      );
    });
  });

  describe("list", () => {
    it("returns all pages", async () => {
      const pages = [{ id: "p1" }, { id: "p2" }];
      repo.list.mockResolvedValue(pages as never);

      const result = await pageService.list();
      expect(result).toEqual(pages);
    });
  });

  describe("getBySlug", () => {
    it("returns page by slug", async () => {
      const page = { id: "p1", slug: "about" };
      repo.findBySlug.mockResolvedValue(page as never);

      const result = await pageService.getBySlug("about");
      expect(result).toEqual(page);
    });
  });
});
