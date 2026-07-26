import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvitation: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn().mockResolvedValue("dev") }));

import { runWithRequestScope } from "@/lib/request-scope";
import { invitationRepository } from "@/repositories/invitation-repository";

function inTenant<T>(tenantId: string, callback: () => T): T {
  return runWithRequestScope(
    {
      requestId: `request-${tenantId}`,
      env: "dev",
      tenantId,
      source: "host",
    },
    callback,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("invitationRepository tenant acceptance paths", () => {
  it("looks up invitation tokens inside the verified tenant", async () => {
    mocks.findFirst.mockResolvedValue({ id: "inv-1" });

    await inTenant("tenant-a", () =>
      invitationRepository.findByTokenHash("token-hash"),
    );

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: "token-hash", tenantId: "tenant-a" },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("preserves global token lookup in deployment-only mode", async () => {
    mocks.findUnique.mockResolvedValue({ id: "inv-1" });

    await invitationRepository.findByTokenHash("token-hash");

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: "token-hash" },
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("updates invitation status only inside the verified tenant", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await inTenant("tenant-a", () =>
      invitationRepository.updateStatus("inv-1", "accepted"),
    );

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", tenantId: "tenant-a" },
      data: { status: "accepted" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves deployment-only status updates", async () => {
    mocks.update.mockResolvedValue({ id: "inv-1", status: "accepted" });

    await invitationRepository.updateStatus("inv-1", "accepted");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted" },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
