import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/base-prisma", () => ({
  basePrisma: {
    tenant: { findUnique: vi.fn() },
    tenantDomain: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/tenant-resolution-config", () => ({
  resolveConfiguredTenantCandidate: vi.fn(),
}));

import { basePrisma } from "@/lib/base-prisma";
import {
  resolveAuthoritativeTenant,
  TenantBindingError,
} from "@/lib/tenant-binding";
import { resolveConfiguredTenantCandidate } from "@/lib/tenant-resolution-config";

const candidate = vi.mocked(resolveConfiguredTenantCandidate);
const tenants = vi.mocked(basePrisma.tenant);
const domains = vi.mocked(basePrisma.tenantDomain);

const input = {
  host: "acme.example.com",
  path: "/login",
  headers: {},
};

beforeEach(() => vi.clearAllMocks());

describe("resolveAuthoritativeTenant", () => {
  it("keeps deployment scope when no candidate is resolved", async () => {
    candidate.mockResolvedValue(null);

    await expect(resolveAuthoritativeTenant(input)).resolves.toBeNull();
    expect(tenants.findUnique).not.toHaveBeenCalled();
    expect(domains.findUnique).not.toHaveBeenCalled();
  });

  it("maps a subdomain key to an active tenant", async () => {
    candidate.mockResolvedValue({ key: "acme", source: "subdomain" });
    tenants.findUnique.mockResolvedValue({
      id: "tenant-1",
      key: "acme",
      status: "active",
    } as never);

    await expect(resolveAuthoritativeTenant(input)).resolves.toEqual({
      id: "tenant-1",
      key: "acme",
      source: "host",
    });
    expect(tenants.findUnique).toHaveBeenCalledWith({
      where: { key: "acme" },
      select: { id: true, key: true, status: true },
    });
  });

  it("maps a path candidate to path request scope", async () => {
    candidate.mockResolvedValue({ key: "acme", source: "path" });
    tenants.findUnique.mockResolvedValue({
      id: "tenant-1",
      key: "acme",
      status: "active",
    } as never);

    await expect(resolveAuthoritativeTenant(input)).resolves.toMatchObject({
      id: "tenant-1",
      source: "path",
    });
  });

  it("maps a signed trusted-header candidate to trusted-header scope", async () => {
    candidate.mockResolvedValue({ key: "acme", source: "trusted-header" });
    tenants.findUnique.mockResolvedValue({
      id: "tenant-1",
      key: "acme",
      status: "active",
    } as never);

    await expect(resolveAuthoritativeTenant(input)).resolves.toMatchObject({
      id: "tenant-1",
      source: "trusted-header",
    });
  });

  it("resolves custom domains only through TenantDomain ownership", async () => {
    candidate.mockResolvedValue({
      key: "portal.customer.example",
      source: "custom-domain",
    });
    domains.findUnique.mockResolvedValue({
      tenant: {
        id: "tenant-2",
        key: "customer",
        status: "active",
      },
    } as never);

    await expect(resolveAuthoritativeTenant(input)).resolves.toEqual({
      id: "tenant-2",
      key: "customer",
      source: "host",
    });
    expect(domains.findUnique).toHaveBeenCalledWith({
      where: { host: "portal.customer.example" },
      select: {
        tenant: {
          select: { id: true, key: true, status: true },
        },
      },
    });
    expect(tenants.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when a key candidate does not exist", async () => {
    candidate.mockResolvedValue({ key: "missing", source: "subdomain" });
    tenants.findUnique.mockResolvedValue(null);

    await expect(resolveAuthoritativeTenant(input)).rejects.toBeInstanceOf(
      TenantBindingError,
    );
  });

  it("fails closed when the tenant is not active", async () => {
    candidate.mockResolvedValue({ key: "disabled", source: "path" });
    tenants.findUnique.mockResolvedValue({
      id: "tenant-disabled",
      key: "disabled",
      status: "disabled",
    } as never);

    await expect(resolveAuthoritativeTenant(input)).rejects.toBeInstanceOf(
      TenantBindingError,
    );
  });

  it("fails closed when a custom domain has no owned tenant", async () => {
    candidate.mockResolvedValue({
      key: "unknown.example.com",
      source: "custom-domain",
    });
    domains.findUnique.mockResolvedValue(null);

    await expect(resolveAuthoritativeTenant(input)).rejects.toBeInstanceOf(
      TenantBindingError,
    );
  });

  it("does not mask unexpected database errors", async () => {
    candidate.mockResolvedValue({ key: "acme", source: "subdomain" });
    const outage = new Error("database unavailable");
    tenants.findUnique.mockRejectedValue(outage);

    await expect(resolveAuthoritativeTenant(input)).rejects.toBe(outage);
  });
});
