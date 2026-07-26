import { basePrisma } from "@/lib/base-prisma";
import { getTenantId } from "@/lib/request-scope";

export type TenantWorkspace = {
  tenantId: string;
  organizationId: string;
};

export class TenantWorkspaceError extends Error {
  constructor() {
    super("Tenant workspace is not available.");
    this.name = "TenantWorkspaceError";
  }
}

/**
 * Resolve the one-per-tenant workspace for the verified request tenant.
 * Deployment-only requests return null and preserve legacy behavior.
 */
export async function resolveCurrentTenantWorkspace(): Promise<TenantWorkspace | null> {
  const tenantId = getTenantId();
  if (!tenantId) return null;

  const organization = await basePrisma.organization.findUnique({
    where: { tenantId },
    select: { id: true, status: true },
  });

  if (!organization || organization.status !== "active") {
    throw new TenantWorkspaceError();
  }

  return { tenantId, organizationId: organization.id };
}

async function requireWorkspaceUser(
  userId: string,
  workspace: TenantWorkspace,
): Promise<{ tenantId: string | null; status: string }> {
  const user = await basePrisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, status: true },
  });
  if (!user || user.tenantId !== workspace.tenantId) {
    throw new TenantWorkspaceError();
  }
  return user;
}

/** Existing identities never gain membership merely by selecting a tenant. */
export async function hasActiveCurrentTenantMembership(
  userId: string,
): Promise<boolean> {
  const tenantId = getTenantId();
  if (!tenantId) return true;

  const membership = await basePrisma.organizationMembership.findFirst({
    where: {
      tenantId,
      userId,
      status: "active",
    },
    select: {
      user: { select: { tenantId: true } },
      organization: {
        select: { tenantId: true, status: true },
      },
    },
  });

  return (
    membership?.user.tenantId === tenantId &&
    membership.organization.tenantId === tenantId &&
    membership.organization.status === "active"
  );
}

/**
 * Provision membership only for a newly authorized local identity.
 *
 * The caller resolves the workspace before creating the user. Existing users
 * must use `hasActiveCurrentTenantMembership()` instead; this function must not
 * be used as a login-time auto-join mechanism.
 */
export async function provisionNewUserTenantMembership(
  userId: string,
  workspace: TenantWorkspace | null,
): Promise<void> {
  if (!workspace) return;

  await requireWorkspaceUser(userId, workspace);

  try {
    await basePrisma.organizationMembership.create({
      data: {
        tenantId: workspace.tenantId,
        organizationId: workspace.organizationId,
        userId,
        ancestors: [],
        status: "active",
      },
    });
    return;
  } catch (error) {
    // Concurrent first-login/registration attempts may race on the compound
    // organization+user unique. Re-read only to accept the exact same active
    // membership; never repair or reassign a conflicting membership silently.
    const existing = await basePrisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: workspace.organizationId,
          userId,
        },
      },
      select: { tenantId: true, status: true },
    });

    if (
      existing?.tenantId === workspace.tenantId &&
      existing.status === "active"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Transitional dual-write for the deprecated User parent/ancestor hierarchy.
 * Mirrors the Stage B mapping so live sub-user writes stay Stage-C clean until
 * organization membership becomes the only hierarchy source.
 */
export async function syncLegacySubUserTenantMembership(
  parentUserId: string,
  userId: string,
): Promise<void> {
  const workspace = await resolveCurrentTenantWorkspace();
  if (!workspace) return;

  const [, user] = await Promise.all([
    requireWorkspaceUser(parentUserId, workspace),
    requireWorkspaceUser(userId, workspace),
  ]);

  const parentMembership = await basePrisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: workspace.organizationId,
        userId: parentUserId,
      },
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      ancestors: true,
    },
  });

  if (
    !parentMembership ||
    parentMembership.tenantId !== workspace.tenantId ||
    parentMembership.status !== "active"
  ) {
    throw new TenantWorkspaceError();
  }

  const ancestors = [...parentMembership.ancestors, parentMembership.id];
  await basePrisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: workspace.organizationId,
        userId,
      },
    },
    create: {
      tenantId: workspace.tenantId,
      organizationId: workspace.organizationId,
      userId,
      parentMembershipId: parentMembership.id,
      ancestors,
      status: user.status === "active" ? "active" : "disabled",
    },
    update: {
      tenantId: workspace.tenantId,
      parentMembershipId: parentMembership.id,
      ancestors,
    },
  });
}

/** Keep membership active when a legacy sub-user is detached from its parent. */
export async function detachLegacySubUserTenantMembership(
  userId: string,
): Promise<void> {
  const workspace = await resolveCurrentTenantWorkspace();
  if (!workspace) return;

  await requireWorkspaceUser(userId, workspace);

  const membership = await basePrisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: workspace.organizationId,
        userId,
      },
    },
    select: { id: true, tenantId: true },
  });
  if (!membership || membership.tenantId !== workspace.tenantId) {
    throw new TenantWorkspaceError();
  }

  await basePrisma.organizationMembership.update({
    where: { id: membership.id },
    data: { parentMembershipId: null, ancestors: [] },
  });
}
