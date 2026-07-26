import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    media: {
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
import { mediaRepository } from "@/repositories/media-repository";

const tenant = vi.mocked(getTenantId);
const media = vi.mocked(prisma.media);

beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue(null);
});

describe("mediaRepository.findById tenant scope", () => {
  it("uses a tenant-qualified lookup when request context is verified", async () => {
    tenant.mockReturnValue("tenant-1");
    media.findFirst.mockResolvedValue(null);

    await mediaRepository.findById("media-1");

    expect(media.findFirst).toHaveBeenCalledWith({
      where: { id: "media-1", tenantId: "tenant-1" },
    });
    expect(media.findUnique).not.toHaveBeenCalled();
  });

  it("preserves deployment-only lookup behavior without tenant context", async () => {
    media.findUnique.mockResolvedValue(null);

    await mediaRepository.findById("media-1");

    expect(media.findUnique).toHaveBeenCalledWith({ where: { id: "media-1" } });
    expect(media.findFirst).not.toHaveBeenCalled();
  });
});
