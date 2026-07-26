import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/tenant-membership", () => ({
  hasActiveCurrentTenantMembership: vi.fn(),
  provisionNewUserTenantMembership: vi.fn(),
  resolveCurrentTenantWorkspace: vi.fn(),
}));
vi.mock("@/repositories/invitation-repository", () => ({
  invitationRepository: {
    findPendingByEmail: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("@/services/setting-service", () => ({
  settingService: {
    getClerkSecurityConfig: vi.fn(),
  },
}));

import { getAppEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
} from "@/lib/tenant-membership";
import { invitationRepository } from "@/repositories/invitation-repository";
import { settingService } from "@/services/setting-service";
import {
  resolveCredentialsIdentity,
  resolveLegacyClerkIdentity,
} from "@/lib/auth/identity-resolver";

const env = vi.mocked(getAppEnv);
const users = vi.mocked(prisma.user);
const hasMembership = vi.mocked(hasActiveCurrentTenantMembership);
const provisionMembership = vi.mocked(provisionNewUserTenantMembership);
const resolveWorkspace = vi.mocked(resolveCurrentTenantWorkspace);
const invitations = vi.mocked(invitationRepository);
const settings = vi.mocked(settingService);

const provider = {
  name: "clerk",
  verify: vi.fn(),
  getProfile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  env.mockResolvedValue("dev");
  hasMembership.mockResolvedValue(true);
  resolveWorkspace.mockResolvedValue({
    tenantId: "tenant-1",
    organizationId: "org-1",
  });
  settings.getClerkSecurityConfig.mockResolvedValue({
    authorizedParties: ["https://app.example.com"],
    openSignup: true,
  });
  invitations.findPendingByEmail.mockResolvedValue(null as never);
});

describe("credentials identity tenancy", () => {
  it("rejects a valid local session identity without current tenant membership", async () => {
    hasMembership.mockResolvedValue(false);

    const result = await resolveCredentialsIdentity(
      {
        provider: "credentials",
        subject: "user-1",
        claims: {
          localUser: {
            id: "user-1",
            name: "User",
            email: "user@example.com",
            status: "active",
            parentId: null,
          },
        },
      },
      { name: "credentials", verify: vi.fn() },
    );

    expect(result).toBeNull();
    expect(hasMembership).toHaveBeenCalledWith("user-1");
  });
});

describe("Clerk identity tenancy", () => {
  it("does not accept a linked Clerk user without current tenant membership", async () => {
    users.findFirst.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      status: "active",
      parentId: null,
      clerkId: "clerk-1",
    } as never);
    hasMembership.mockResolvedValue(false);

    const result = await resolveLegacyClerkIdentity(
      {
        provider: "clerk",
        subject: "clerk-1",
        email: "user@example.com",
        claims: {},
      },
      provider,
    );

    expect(result).toBeNull();
    expect(hasMembership).toHaveBeenCalledWith("user-1");
  });

  it("does not link an existing email account before membership is proven", async () => {
    users.findFirst.mockResolvedValue(null);
    users.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      status: "active",
      parentId: null,
      clerkId: null,
    } as never);
    hasMembership.mockResolvedValue(false);

    const result = await resolveLegacyClerkIdentity(
      {
        provider: "clerk",
        subject: "clerk-1",
        email: "user@example.com",
        claims: {},
      },
      provider,
    );

    expect(result).toBeNull();
    expect(users.update).not.toHaveBeenCalled();
    expect(resolveWorkspace).not.toHaveBeenCalled();
    expect(provisionMembership).not.toHaveBeenCalled();
  });

  it("provisions membership only after creating a newly authorized Clerk user", async () => {
    users.findFirst.mockResolvedValue(null);
    users.findUnique.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: "user-new",
      email: "new@example.com",
      name: "New User",
      status: "active",
      parentId: null,
      clerkId: "clerk-new",
    } as never);

    const result = await resolveLegacyClerkIdentity(
      {
        provider: "clerk",
        subject: "clerk-new",
        email: "new@example.com",
        name: "New User",
        claims: {},
      },
      provider,
    );

    expect(resolveWorkspace).toHaveBeenCalledTimes(1);
    expect(users.create).toHaveBeenCalledTimes(1);
    expect(provisionMembership).toHaveBeenCalledWith("user-new", {
      tenantId: "tenant-1",
      organizationId: "org-1",
    });
    expect(result).toMatchObject({ id: "user-new" });
  });

  it("does not auto-provision a user found after a create race", async () => {
    users.findFirst.mockResolvedValue(null);
    users.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user-race",
        email: "race@example.com",
        name: "Race User",
        status: "active",
        parentId: null,
        clerkId: "clerk-race",
      } as never);
    users.create.mockRejectedValue(new Error("duplicate"));
    hasMembership.mockResolvedValue(false);

    const result = await resolveLegacyClerkIdentity(
      {
        provider: "clerk",
        subject: "clerk-race",
        email: "race@example.com",
        claims: {},
      },
      provider,
    );

    expect(result).toBeNull();
    expect(provisionMembership).not.toHaveBeenCalled();
  });
});
