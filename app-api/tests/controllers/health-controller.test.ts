import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/base-prisma", () => ({
  basePrisma: {
    systemConfig: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-request-scope", () => ({
  resolveRequestId: vi.fn(() => "request-health"),
}));

vi.mock("@/lib/server-logger", () => ({
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { basePrisma } from "@/lib/base-prisma";
import {
  livenessController,
  readinessController,
} from "@/controllers/health-controller";
import { serverLogger } from "@/lib/server-logger";

const database = vi.mocked(basePrisma.systemConfig);
const logger = vi.mocked(serverLogger);

function request(method = "GET"): NextApiRequest {
  return { method, headers: {} } as unknown as NextApiRequest;
}

function response() {
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = {
    status: vi.fn(),
    json,
    setHeader,
  } as unknown as NextApiResponse;
  vi.mocked(res.status).mockReturnValue(res);
  return { res, json, setHeader };
}

beforeEach(() => vi.clearAllMocks());

describe("health controllers", () => {
  it("reports process liveness without touching the database", async () => {
    const { res, json, setHeader } = response();

    await livenessController(request(), res);

    expect(database.findFirst).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        status: "ok",
        service: "app-api",
      }),
    });
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "request-health");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("reports readiness when MongoDB responds", async () => {
    database.findFirst.mockResolvedValue(null);
    const { res, json } = response();

    await readinessController(request(), res);

    expect(database.findFirst).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        status: "ok",
        database: "ok",
      }),
    });
  });

  it("returns 503 without database internals when readiness fails", async () => {
    database.findFirst.mockRejectedValue(
      new Error("mongodb://secret-user:secret-password@host"),
    );
    const { res, json } = response();

    await readinessController(request(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      data: expect.objectContaining({
        status: "unavailable",
        database: "unavailable",
      }),
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain("secret-password");
    expect(logger.error).toHaveBeenCalled();
  });

  it("rejects unsupported health methods", async () => {
    const { res } = response();

    await livenessController(request("POST"), res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
