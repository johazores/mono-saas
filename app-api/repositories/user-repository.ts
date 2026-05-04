import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import type { Prisma } from "@prisma/client";

const safeSelect = {
  id: true,
  email: true,
  clerkId: true,
  name: true,
  stripeCustomerId: true,
  status: true,
  parentId: true,
  ancestors: true,
  lastLoginAt: true,
  phone: true,
  address: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const userRepository = {
  list() {
    return prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: safeSelect,
    });
  },
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: safeSelect,
    });
  },
  findByEmailWithPassword(email: string) {
    return prisma.user.findUnique({
      where: {
        env_email: { env: getAppEnv(), email: email.toLowerCase().trim() },
      },
    });
  },
  findByClerkId(clerkId: string) {
    return prisma.user.findFirst({
      where: { clerkId },
    });
  },
  findByIdWithPassword(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  findByParentId(parentId: string) {
    return prisma.user.findMany({
      where: { parentId },
      orderBy: [{ createdAt: "desc" }],
      select: safeSelect,
    });
  },
  countChildren(parentId: string) {
    return prisma.user.count({ where: { parentId } });
  },
  findDescendants(ancestorId: string) {
    return prisma.user.findMany({
      where: { ancestors: { has: ancestorId } },
      orderBy: [{ createdAt: "desc" }],
      select: safeSelect,
    });
  },
  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },
  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },
  async delete(id: string) {
    await prisma.userSession.deleteMany({ where: { userId: id } });
    return prisma.user.delete({ where: { id } });
  },
  touchLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  },
};
