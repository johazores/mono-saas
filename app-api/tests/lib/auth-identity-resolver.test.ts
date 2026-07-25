import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getAppEnv: vi.fn().mockResolvedValue("dev"),
}));

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

import { prisma } from "@/lib/prisma";
import { invitationRepository } from "@/repositories/invitation-repository";
import { settingService } from "@/services/setting-service";
import {
  resolveCredentialsIdentity,
  resolveLegacyClerkIdentity,
} from "@/lib/auth/identity-resolver";
import type { AuthProviderInterface } from "@/lib/auth/types";

const users = vi.mocked(prisma.user);
const invitations = vi.mocked(invitationRepository);
const settings = vi.mocked(settingService);
const getProfile = vi.fn();

const provider = {
  name: "clerk",
  verify: vi.fn(),
  getProfile,
} as unknown as AuthProviderInterface;

const credentialsProvider = {
  name: "credentials",
  verify: vi.fn(),
} as unknown as AuthProviderInterface;

beforeEach(() => {
  vi.clearAllMocks();
  settings.getClerkSecurityConfig.mockResolvedValue({
    authorizedParties: ["https://example.com"],
    openSignup: false,
  });
  invitations.findPendingByEmail.mockResolvedValue(null);
});

describe("identity resolvers", () => {
  it("uses the safe credentials user snapshot without another database lookup", async () => {
    await expect(
      resolveCredentialsIdentity(
        {
          provider: "credentials",
          subject: "user-id",
          email: "user@example.com",
          claims: {
            localUser: {
              id: "user-id",
              name: "User",
              email: "user@example.com",
              status: "active",
              parentId: null,
            },
          },
        },
        credentialsProvider,
      ),
    ).resolves.toEqual({
      id: "user-id",
      name: "User",
      email: "user@example.com",
      status: "active",
      parentId: null,
    });

    expect(users.findUnique).not.toHaveBeenCalled();
  });

  it("resolves an existing Clerk link locally without profile or provisioning calls", async () => {
    users.findFirst.mockResolvedValue({
      id: "local-user",
      name: "Linked",
      email: "linked@example.com",
      status: "active",
      parentId: null,
      clerkId: "clerk-subject",
    } as never);

    const result = await resolveLegacyClerkIdentity(
      {
        provider: "clerk",
        subject: "clerk-subject",
        claims: {},
      },
      provider,
    );

    expect(result).toMatchObject({ id: "local-user" });
    expect(getProfile).not.toHaveBeenCalled();
    expect(invitations.findPendingByEmail).not.toHaveBeenCalled();
  });

  it("never takes over an account linked to another Clerk subject", async () => {
    users.findFirst.mockResolvedValue(null);
    users.findUnique.mockResolvedValue({
      id: "existing-user",
      name: "Existing",
      email: "user@example.com",
      status: "active",
      parentId: null,
      clerkId: "different-subject",
    } as never);

    await expect(
      resolveLegacyClerkIdentity(
        {
          provider: "clerk",
          subject: "new-subject",
          email: "USER@example.com ",
          claims: {},
        },
        provider,
      ),
    ).resolves.toBeNull();

    expect(users.update).not.toHaveBeenCalled();
  });

  it("requires invitation or explicit open signup before provisioning", async () => {
    users.findFirst.mockResolvedValue(null);
    users.findUnique.mockResolvedValue(null);

    await expect(
      resolveLegacyClerkIdentity(
        {
          provider: "clerk",
          subject: "new-subject",
          email: "new@example.com",
          name: "New User",
          claims: {},
        },
        provider,
      ),
    ).resolves.toBeNull();

    expect(users.create).not.toHaveBeenCalled();

    const invitation = {
      id: "invite-id",
      email: "new@example.com",
      status: "pending",
    };
    invitations.findPendingByEmail.mockResolvedValue(invitation as never);
    users.create.mockResolvedValue({
      id: "new-user",
      name: "New User",
      email: "new@example.com",
      status: "active",
      parentId: null,
      clerkId: "new-subject",
    } as never);

    await expect(
      resolveLegacyClerkIdentity(
        {
          provider: "clerk",
          subject: "new-subject",
          email: "new@example.com",
          name: "New User",
          claims: {},
        },
        provider,
      ),
    ).resolves.toMatchObject({ id: "new-user" });

    expect(invitations.updateStatus).toHaveBeenCalledWith(
      "invite-id",
      "accepted",
    );
  });
});
