import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const pageRepository = {
  list() {
    return prisma.page.findMany({
      orderBy: { updatedAt: "desc" },
    });
  },

  listPublished() {
    return prisma.page.findMany({
      where: { status: "published" },
      orderBy: { title: "asc" },
    });
  },

  findById(id: string) {
    return prisma.page.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.page.findFirst({ where: { slug } });
  },

  findHomepage() {
    return prisma.page.findFirst({
      where: { isHomepage: true, status: "published" },
    });
  },

  async unsetAllHomepages() {
    await prisma.page.updateMany({
      where: { isHomepage: true },
      data: { isHomepage: false },
    });
  },

  create(data: Prisma.PageCreateInput) {
    return prisma.page.create({ data });
  },

  update(id: string, data: Prisma.PageUpdateInput) {
    return prisma.page.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.page.delete({ where: { id } });
  },
};
