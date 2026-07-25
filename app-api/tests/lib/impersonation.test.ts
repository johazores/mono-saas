import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/session-secrets", () => ({
  getUserSessionSecret: () => "test-secret-at-least-32-characters-long",
}));
vi.mock("@/lib/clerk-auth", () => ({
  verifyClerkAuthorization: vi.fn(),
  verifyClerkToken: vi.fn(),
  getClerkUserProfile: vi.fn(),
}));
vi.mock("@/services/setting-service", () => ({ settingService: {} }));
vi.mock("@/repositories/invitation-repository", () => ({
  invitationRepository: {},
}));

import {
  getImpersonationInfo,
  setImpersonationCookie,
} from "@/lib/user-auth";

function makeResponse() {
  const headers: string[] = [];
  return {
    headers,
    response: {
      appendHeader: (_name: string, value: string) => headers.push(value),
    } as unknown as NextApiResponse,
  };
}

function requestWithCookie(value: string) {
  return {
    cookies: { admin_impersonating: value },
  } as unknown as NextApiRequest;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-25T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("impersonation cookie", () => {
  it("accepts a valid signed token within its one-hour lifetime", () => {
    const { response, headers } = makeResponse();
    setImpersonationCookie("admin-id", "user-id", response);

    const cookieValue = headers[0]
      .split(";")[0]
      .replace("admin_impersonating=", "");

    expect(getImpersonationInfo(requestWithCookie(cookieValue))).toEqual({
      adminId: "admin-id",
      userId: "user-id",
    });
    expect(headers[0]).toContain("Max-Age=3600");
  });

  it("rejects an expired token even when its signature is valid", () => {
    const { response, headers } = makeResponse();
    setImpersonationCookie("admin-id", "user-id", response);
    const cookieValue = headers[0]
      .split(";")[0]
      .replace("admin_impersonating=", "");

    vi.setSystemTime(new Date("2026-07-25T13:00:01Z"));
    expect(getImpersonationInfo(requestWithCookie(cookieValue))).toBeNull();
  });

  it("rejects a tampered token", () => {
    const { response, headers } = makeResponse();
    setImpersonationCookie("admin-id", "user-id", response);
    const cookieValue = headers[0]
      .split(";")[0]
      .replace("admin_impersonating=", "")
      .replace("user-id", "other-user");

    expect(getImpersonationInfo(requestWithCookie(cookieValue))).toBeNull();
  });
});
