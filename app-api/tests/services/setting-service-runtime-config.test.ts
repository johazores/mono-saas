import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/setting-repository", () => ({
  settingRepository: {
    get: vi.fn(),
    getMany: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
  },
}));

import { settingService } from "@/services/setting-service";
import { settingRepository } from "@/repositories/setting-repository";

const repo = vi.mocked(settingRepository);
const originalClientOrigin = process.env.CLIENT_ORIGIN;

function fakeSetting(key: string, value: unknown) {
  return {
    id: key,
    env: "dev",
    key,
    value,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingService.invalidateCache();
  process.env.CLIENT_ORIGIN = "https://environment.example.com";
});

afterEach(() => {
  if (originalClientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = originalClientOrigin;
});

describe("database-backed runtime configuration", () => {
  it("does not fall back to environment variables for Clerk security", async () => {
    repo.getMany.mockResolvedValue([]);

    await expect(settingService.getClerkSecurityConfig()).resolves.toEqual({
      authorizedParties: [],
      openSignup: false,
    });
  });

  it("loads Clerk security settings from the database", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting("auth.authorizedParties", [
        "https://app.example.com",
        "https://admin.example.com",
      ]),
      fakeSetting("auth.openSignup", true),
    ] as never);

    await expect(settingService.getClerkSecurityConfig()).resolves.toEqual({
      authorizedParties: [
        "https://app.example.com",
        "https://admin.example.com",
      ],
      openSignup: true,
    });
  });
});
