import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/user-auth", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/services/purchase-file-service", () => ({
  purchaseFileService: {
    getById: vi.fn(),
    getDownloadAccess: vi.fn(),
    getDownloadsForUser: vi.fn(),
  },
}));
vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: {
    findById: vi.fn(),
  },
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

import { requireUser } from "@/lib/user-auth";
import { purchaseFileDownloadController } from "@/controllers/purchase-file-controller";
import { purchaseFileService } from "@/services/purchase-file-service";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { logActivity } from "@/lib/activity-logger";

const auth = vi.mocked(requireUser);
const files = vi.mocked(purchaseFileService);
const purchases = vi.mocked(purchaseRepository);
const activity = vi.mocked(logActivity);

function request(): NextApiRequest {
  return {
    method: "GET",
    query: { fileId: "file-1" },
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const json = vi.fn();
  const send = vi.fn();
  const setHeader = vi.fn();
  const redirect = vi.fn();
  const status = vi.fn();
  const res = {
    status,
    json,
    send,
    setHeader,
    redirect,
  } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  redirect.mockReturnValue(res);
  return { res, status, json, send, setHeader, redirect };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: {
      id: "user-1",
      name: "User",
      email: "user@example.com",
      status: "active",
      parentId: null,
      parent: null,
      activePlan: null,
    },
  });
  files.getById.mockResolvedValue({
    id: "file-1",
    env: "dev",
    purchaseId: "purchase-1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    data: null,
    storageProvider: "s3-compatible",
    storageKey: "files/report.pdf",
    checksum: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("purchaseFileDownloadController storage authorization", () => {
  it("does not issue signed storage access for another user's purchase", async () => {
    purchases.findById.mockResolvedValue({
      id: "purchase-1",
      userId: "other-user",
      status: "completed",
    } as never);
    const { res, status } = response();

    await purchaseFileDownloadController(request(), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(files.getDownloadAccess).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
  });

  it("does not issue signed storage access for an invalid purchase status", async () => {
    purchases.findById.mockResolvedValue({
      id: "purchase-1",
      userId: "user-1",
      status: "refunded",
    } as never);
    const { res, status } = response();

    await purchaseFileDownloadController(request(), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(files.getDownloadAccess).not.toHaveBeenCalled();
  });

  it("redirects only after authorization succeeds", async () => {
    purchases.findById.mockResolvedValue({
      id: "purchase-1",
      userId: "user-1",
      status: "completed",
    } as never);
    files.getDownloadAccess.mockResolvedValue({
      kind: "storage",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      url: "https://storage.example/signed",
      expiresAt: new Date("2026-07-25T12:05:00Z"),
    });
    const { res, redirect, setHeader } = response();

    await purchaseFileDownloadController(request(), res);

    expect(files.getDownloadAccess).toHaveBeenCalledTimes(1);
    expect(activity).toHaveBeenCalledWith(
      expect.anything(),
      "file.download",
      expect.objectContaining({
        actorId: "user-1",
        metadata: expect.objectContaining({ delivery: "storage" }),
      }),
    );
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(redirect).toHaveBeenCalledWith(
      302,
      "https://storage.example/signed",
    );
  });
});
