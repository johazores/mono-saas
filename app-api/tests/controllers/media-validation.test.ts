import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/csrf", () => ({
  verifyCsrf: vi.fn(),
}));
vi.mock("@/services/media-service", () => ({
  mediaService: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    getFileAccess: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

import { requireAdmin } from "@/lib/admin-auth";
import { verifyCsrf } from "@/lib/csrf";
import { logActivity } from "@/lib/activity-logger";
import { mediaCollectionController } from "@/controllers/media-controller";
import { mediaService } from "@/services/media-service";

const auth = vi.mocked(requireAdmin);
const csrf = vi.mocked(verifyCsrf);
const media = vi.mocked(mediaService);
const activity = vi.mocked(logActivity);

function request(body: unknown): NextApiRequest {
  return {
    method: "POST",
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  return { res, status, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    admin: {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    },
  } as never);
  csrf.mockReturnValue(true);
});

describe("mediaCollectionController request validation", () => {
  it("rejects a missing file name before calling the media service", async () => {
    const { res, status, json } = response();

    await mediaCollectionController(
      request({ mimeType: "image/png" }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Invalid request.",
      details: {
        fields: expect.objectContaining({
          fileName: expect.any(Array),
        }),
      },
    });
    expect(media.create).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
  });

  it("does not coerce a string size into a number", async () => {
    const { res, status, json } = response();

    await mediaCollectionController(
      request({
        fileName: "image.png",
        mimeType: "image/png",
        size: "100",
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            size: expect.any(Array),
          }),
        },
      }),
    );
    expect(media.create).not.toHaveBeenCalled();
  });

  it("passes only normalized supported fields to the service", async () => {
    media.create.mockResolvedValue({
      id: "media-1",
      fileName: "photo.png",
    } as never);
    const { res, status } = response();

    await mediaCollectionController(
      request({
        source: "upload",
        fileName: "  photo.png  ",
        mimeType: "image/png",
        size: 4,
        altText: "  Product photo  ",
        unexpected: "must-not-reach-service",
      }),
      res,
    );

    expect(media.create).toHaveBeenCalledWith({
      source: "upload",
      fileName: "photo.png",
      originalName: "",
      mimeType: "image/png",
      size: 4,
      altText: "Product photo",
    });
    expect(activity).toHaveBeenCalledWith(
      expect.anything(),
      "media.create",
      expect.objectContaining({
        actorId: "admin-1",
        resourceId: "media-1",
      }),
    );
    expect(status).toHaveBeenCalledWith(201);
  });

  it("rejects an oversized request body string before persistence", async () => {
    const { res, status } = response();

    await mediaCollectionController(
      request({
        fileName: "large.png",
        mimeType: "image/png",
        base64Data: "A".repeat(700_001),
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(media.create).not.toHaveBeenCalled();
  });
});
