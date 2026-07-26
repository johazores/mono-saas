import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/repositories/feature-repository", () => ({
  featureRepository: {
    list: vi.fn(),
    listAll: vi.fn(),
    findById: vi.fn(),
    findByKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));
vi.mock("@/lib/request-scope", () => ({ getTenantId: vi.fn() }));

import {
  getAllFeatures,
  invalidateFeatureCache,
  getFeatureDefinition,
  isFeatureEnabled,
  getEnabledFeatures,
} from "@/lib/feature-registry";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import { featureRepository } from "@/repositories/feature-repository";

const repo = vi.mocked(featureRepository);
const env = vi.mocked(getAppEnv);
const tenant = vi.mocked(getTenantId);

const fakeRows = [
  { key: "storage.5gb", description: "5 GB storage", category: "storage" },
  { key: "api.access", description: "API access", category: "features" },
  { key: "support.email", description: "Email support", category: "support" },
];

beforeEach(() => {
  vi.clearAllMocks();
  invalidateFeatureCache();
  tenant.mockReturnValue(null);
  env.mockResolvedValue("dev");
});

describe("getAllFeatures", () => {
  it("fetches from repository on first call", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const result = await getAllFeatures();

    expect(repo.list).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { key: "storage.5gb", description: "5 GB storage", category: "storage" },
      { key: "api.access", description: "API access", category: "features" },
      {
        key: "support.email",
        description: "Email support",
        category: "support",
      },
    ]);
  });

  it("returns cached data on subsequent calls within TTL", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    await getAllFeatures();
    await getAllFeatures();
    await getAllFeatures();

    expect(repo.list).toHaveBeenCalledOnce();
  });

  it("isolates cached definitions by tenant", async () => {
    tenant.mockReturnValue("tenant-a");
    repo.list.mockResolvedValueOnce([
      { key: "feature.a", description: "A", category: "tenant" },
    ] as never);

    const tenantA = await getAllFeatures();

    tenant.mockReturnValue("tenant-b");
    repo.list.mockResolvedValueOnce([
      { key: "feature.b", description: "B", category: "tenant" },
    ] as never);

    const tenantB = await getAllFeatures();

    tenant.mockReturnValue("tenant-a");
    const tenantAAgain = await getAllFeatures();

    expect(tenantA.map((item) => item.key)).toEqual(["feature.a"]);
    expect(tenantB.map((item) => item.key)).toEqual(["feature.b"]);
    expect(tenantAAgain.map((item) => item.key)).toEqual(["feature.a"]);
    expect(repo.list).toHaveBeenCalledTimes(2);
    expect(env).not.toHaveBeenCalled();
  });

  it("isolates deployment-only cache entries by environment", async () => {
    env.mockResolvedValueOnce("dev").mockResolvedValueOnce("production");
    repo.list
      .mockResolvedValueOnce([
        { key: "dev.feature", description: "Dev", category: "env" },
      ] as never)
      .mockResolvedValueOnce([
        { key: "prod.feature", description: "Prod", category: "env" },
      ] as never);

    const dev = await getAllFeatures();
    const production = await getAllFeatures();

    expect(dev.map((item) => item.key)).toEqual(["dev.feature"]);
    expect(production.map((item) => item.key)).toEqual(["prod.feature"]);
    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it("refetches after cache is invalidated", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    await getAllFeatures();
    invalidateFeatureCache();
    await getAllFeatures();

    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when repository returns empty", async () => {
    repo.list.mockResolvedValue([] as never);

    const result = await getAllFeatures();
    expect(result).toEqual([]);
  });
});

describe("getFeatureDefinition", () => {
  it("returns the matching feature definition", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const def = await getFeatureDefinition("api.access");
    expect(def).toEqual({
      key: "api.access",
      description: "API access",
      category: "features",
    });
  });

  it("returns undefined for unknown key", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const def = await getFeatureDefinition("nonexistent.feature");
    expect(def).toBeUndefined();
  });
});

describe("isFeatureEnabled", () => {
  it("returns true when key is in plan features", () => {
    expect(isFeatureEnabled(["api.access", "storage.5gb"], "api.access")).toBe(
      true,
    );
  });

  it("returns false when key is not in plan features", () => {
    expect(isFeatureEnabled(["storage.5gb"], "api.access")).toBe(false);
  });

  it("returns false for empty plan features", () => {
    expect(isFeatureEnabled([], "api.access")).toBe(false);
  });
});

describe("getEnabledFeatures", () => {
  it("returns only features whose keys are in the plan", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const result = await getEnabledFeatures(["api.access", "support.email"]);
    expect(result).toEqual([
      { key: "api.access", description: "API access", category: "features" },
      {
        key: "support.email",
        description: "Email support",
        category: "support",
      },
    ]);
  });

  it("returns empty array when no plan features match", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const result = await getEnabledFeatures(["nonexistent"]);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty plan features", async () => {
    repo.list.mockResolvedValue(fakeRows as never);

    const result = await getEnabledFeatures([]);
    expect(result).toEqual([]);
  });
});
