import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/base-prisma", () => ({
  basePrisma: {
    organization: { findUnique: vi.fn() },
    organizationMembership: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

import { basePrisma } from "@/lib/base-prisma";
import { runWithRequestScope } from "@/lib/request-scope";
import {
  detachLegacySubUserTenantMembership,
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
  syncLegacySubUserTenantMembership,
  TenantWorkspaceError,
} from "@/lib/tenant-membership";

const organization = vi.mocked(basePrisma.organization);
const memberships = vi.mocked(basePrisma.organizationMembership);
const users = vi.mocked(basePrisma.user);

function inTenant<T>(callback: () => T): T {
  return runWithRequestScope(
    {
      requestId: "request-1",
      env: "dev",
      tenantId: "tenant-1",
      source: "host",
    },
    callback,
  );
}

function activeOrganization() {
  organization.findUnique.mockResolvedValue({
    id: "org-1",
    status: "active",
  } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("resolveCurrentTenantWorkspace", () => {
  it("preserves deployment-only behavior when no tenant is bound", async () => {
    await expect(resolveCurrentTenantWorkspace()).resolves.toBeNull();
    expect(organization.findUnique).not.toHaveBeenCalled();
  });

  it("resolves the active one-per-tenant organization", async () => {
    activeOrganization();

    await expect(
      inTenant(() => resolveCurrentTenantWorkspace()),
    ).resolves.toEqual({ tenantId: "tenant-1", organizationId: "org-1" });
  });

  it("fails closed when the tenant workspace is missing or inactive", async () => {
    organization.findUnique.mockResolvedValue(null);
    await expect(
      inTenant(() => resolveCurrentTenantWorkspace()),
    ).rejects.toBeInstanceOf(TenantWorkspaceError);

    organization.findUnique.mockResolvedValue({
      id: "org-1",
      status: "disabled",
    } as never);
    await expect(
      inTenant(() => resolveCurrentTenantWorkspace()),
    ).rejects.toBeInstanceOf(TenantWorkspaceError);
  });
});

describe("hasActiveCurrentTenantMembership", () => {
  it("does not require membership in deployment-only mode", async () => {
    await expect(hasActiveCurrentTenantMembership("user-1")).resolves.toBe(true);
    expect(memberships.findFirst).not.toHaveBeenCalled();
  });

  it("requires user, membership, and organization tenant consistency", async () => {
    memberships.findFirst.mockResolvedValue({
      user: { tenantId: "tenant-1" },
      organization: { tenantId: "tenant-1", status: "active" },
    } as never);

    await expect(
      inTenant(() => hasActiveCurrentTenantMembership("user-1")),
    ).resolves.toBe(true);
    expect(memberships.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        userId: "user-1",
        status: "active",
      },
      select: {
        user: { select: { tenantId: true } },
        organization: {
          select: { tenantId: true, status: true },
        },
      },
    });
  });

  it("rejects missing, cross-tenant, or inactive memberships", async () => {
    memberships.findFirst.mockResolvedValueOnce(null);
    await expect(
      inTenant(() => hasActiveCurrentTenantMembership("user-1")),
    ).resolves.toBe(false);

    memberships.findFirst.mockResolvedValueOnce({
      user: { tenantId: "tenant-2" },
      organization: { tenantId: "tenant-1", status: "active" },
    } as never);
    await expect(
      inTenant(() => hasActiveCurrentTenantMembership("user-1")),
    ).resolves.toBe(false);

    memberships.findFirst.mockResolvedValueOnce({
      user: { tenantId: "tenant-1" },
      organization: { tenantId: "tenant-1", status: "disabled" },
    } as never);
    await expect(
      inTenant(() => hasActiveCurrentTenantMembership("user-1")),
    ).resolves.toBe(false);
  });
});

describe("provisionNewUserTenantMembership", () => {
  const workspace = { tenantId: "tenant-1", organizationId: "org-1" };

  it("is a no-op without tenant workspace context", async () => {
    await provisionNewUserTenantMembership("user-1", null);
    expect(users.findUnique).not.toHaveBeenCalled();
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it("requires the new user to carry the same staged tenant", async () => {
    users.findUnique.mockResolvedValue({
      tenantId: "tenant-2",
      status: "active",
    } as never);

    await expect(
      provisionNewUserTenantMembership("user-1", workspace),
    ).rejects.toBeInstanceOf(TenantWorkspaceError);
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it("creates an active root membership for a correctly staged new user", async () => {
    users.findUnique.mockResolvedValue({
      tenantId: "tenant-1",
      status: "active",
    } as never);
    memberships.create.mockResolvedValue({ id: "membership-1" } as never);

    await provisionNewUserTenantMembership("user-1", workspace);

    expect(memberships.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        organizationId: "org-1",
        userId: "user-1",
        ancestors: [],
        status: "active",
      },
    });
  });

  it("accepts only the same active membership after a create race", async () => {
    users.findUnique.mockResolvedValue({
      tenantId: "tenant-1",
      status: "active",
    } as never);
    const race = new Error("duplicate");
    memberships.create.mockRejectedValue(race);
    memberships.findUnique.mockResolvedValue({
      id: "membership-1",
      tenantId: "tenant-1",
      status: "active",
      ancestors: [],
    } as never);

    await expect(
      provisionNewUserTenantMembership("user-1", workspace),
    ).resolves.toBeUndefined();
  });

  it("rethrows a conflicting membership race instead of repairing it", async () => {
    users.findUnique.mockResolvedValue({
      tenantId: "tenant-1",
      status: "active",
    } as never);
    const race = new Error("duplicate");
    memberships.create.mockRejectedValue(race);
    memberships.findUnique.mockResolvedValue({
      id: "membership-1",
      tenantId: "tenant-2",
      status: "active",
      ancestors: [],
    } as never);

    await expect(
      provisionNewUserTenantMembership("user-1", workspace),
    ).rejects.toBe(race);
  });
});

describe("legacy sub-user membership dual-write", () => {
  beforeEach(() => activeOrganization());

  it("maps legacy hierarchy to membership IDs exactly like the backfill", async () => {
    users.findUnique
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never)
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never);
    memberships.findUnique
      .mockResolvedValueOnce({
        id: "membership-parent",
        tenantId: "tenant-1",
        status: "active",
        ancestors: ["membership-root"],
      } as never)
      .mockResolvedValueOnce(null);
    memberships.create.mockResolvedValue({ id: "membership-child" } as never);

    await inTenant(() =>
      syncLegacySubUserTenantMembership("parent-user", "child-user"),
    );

    expect(memberships.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        organizationId: "org-1",
        userId: "child-user",
        parentMembershipId: "membership-parent",
        ancestors: ["membership-root", "membership-parent"],
        status: "active",
      },
    });
  });

  it("updates a same-tenant existing membership without rewriting tenant ownership", async () => {
    users.findUnique
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never)
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never);
    memberships.findUnique
      .mockResolvedValueOnce({
        id: "membership-parent",
        tenantId: "tenant-1",
        status: "active",
        ancestors: [],
      } as never)
      .mockResolvedValueOnce({
        id: "membership-child",
        tenantId: "tenant-1",
        status: "active",
        ancestors: [],
      } as never);

    await inTenant(() =>
      syncLegacySubUserTenantMembership("parent-user", "child-user"),
    );

    expect(memberships.update).toHaveBeenCalledWith({
      where: { id: "membership-child" },
      data: {
        parentMembershipId: "membership-parent",
        ancestors: ["membership-parent"],
      },
    });
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it("fails closed on a conflicting child membership tenant", async () => {
    users.findUnique
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never)
      .mockResolvedValueOnce({ tenantId: "tenant-1", status: "active" } as never);
    memberships.findUnique
      .mockResolvedValueOnce({
        id: "membership-parent",
        tenantId: "tenant-1",
        status: "active",
        ancestors: [],
      } as never)
      .mockResolvedValueOnce({
        id: "membership-child",
        tenantId: "tenant-2",
        status: "active",
        ancestors: [],
      } as never);

    await expect(
      inTenant(() =>
        syncLegacySubUserTenantMembership("parent-user", "child-user"),
      ),
    ).rejects.toBeInstanceOf(TenantWorkspaceError);
    expect(memberships.update).not.toHaveBeenCalled();
  });

  it("detaches membership hierarchy without removing workspace access", async () => {
    users.findUnique.mockResolvedValue({
      tenantId: "tenant-1",
      status: "active",
    } as never);
    memberships.findUnique.mockResolvedValue({
      id: "membership-child",
      tenantId: "tenant-1",
      status: "active",
      ancestors: ["membership-parent"],
    } as never);

    await inTenant(() => detachLegacySubUserTenantMembership("child-user"));

    expect(memberships.update).toHaveBeenCalledWith({
      where: { id: "membership-child" },
      data: { parentMembershipId: null, ancestors: [] },
    });
  });
});
