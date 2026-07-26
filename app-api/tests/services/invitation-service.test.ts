import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/repositories/invitation-repository", () => ({
  invitationRepository: {
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/setting-service", () => ({
  settingService: {
    getAuthConfig: vi.fn().mockResolvedValue({
      provider: "credentials",
      clerkPublishableKey: "",
      clerkSecretKey: "",
    }),
  },
}));

vi.mock("@/services/user-service", () => ({
  userService: {
    registerForCurrentWorkspace: vi.fn(),
  },
}));

vi.mock("@/lib/secure-credentials", () => ({
  getUserSessionSecret: () => "test-secret-at-least-32-characters-long!!",
}));

import { invitationService } from "@/services/invitation-service";
import { invitationRepository } from "@/repositories/invitation-repository";
import { userService } from "@/services/user-service";

const repo = vi.mocked(invitationRepository);
const userSvc = vi.mocked(userService);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invitationService.create", () => {
  it("creates a credential invitation with token", async () => {
    repo.create.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "test@example.com",
      name: "Test",
      tokenHash: "hashed",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await invitationService.create(
      { email: "test@example.com", name: "Test" },
      "admin-1",
    );

    expect(result.invitation.email).toBe("test@example.com");
    expect(result.token).toBeDefined();
    expect(result.token!.length).toBeGreaterThan(0);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        name: "Test",
        invitedBy: "admin-1",
      }),
    );
  });

  it("throws if email is empty", async () => {
    await expect(
      invitationService.create({ email: "" }, "admin-1"),
    ).rejects.toThrow("Email is required.");
  });

  it("normalizes email to lowercase", async () => {
    repo.create.mockResolvedValue({
      id: "inv-2",
      env: "dev",
      email: "upper@example.com",
      name: null,
      tokenHash: "hashed",
      status: "pending",
      expiresAt: new Date(),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await invitationService.create(
      { email: "  Upper@Example.COM  " },
      "admin-1",
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "upper@example.com" }),
    );
  });
});

describe("invitationService.accept", () => {
  it("accepts a valid pending invitation through workspace registration", async () => {
    repo.findByTokenHash.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "invited@test.com",
      name: "Invited",
      tokenHash: "hash",
      status: "pending",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userSvc.registerForCurrentWorkspace.mockResolvedValue({
      id: "user-1",
      email: "invited@test.com",
      name: "Invited",
    } as never);

    const result = await invitationService.accept({
      token: "raw-token",
      password: "StrongPass1",
      name: "Invited",
    });

    expect(result).toEqual(
      expect.objectContaining({ email: "invited@test.com" }),
    );
    expect(repo.updateStatus).toHaveBeenCalledWith("inv-1", "accepted");
    expect(userSvc.registerForCurrentWorkspace).toHaveBeenCalledWith({
      name: "Invited",
      email: "invited@test.com",
      password: "StrongPass1",
    });
  });

  it("throws if token is missing", async () => {
    await expect(
      invitationService.accept({ token: "", password: "Pass1234" }),
    ).rejects.toThrow("Token and password are required.");
  });

  it("throws if password is too short", async () => {
    await expect(
      invitationService.accept({ token: "abc", password: "short" }),
    ).rejects.toThrow("Password must be at least 8 characters.");
  });

  it("throws for invalid token", async () => {
    repo.findByTokenHash.mockResolvedValue(null);

    await expect(
      invitationService.accept({ token: "bad-token", password: "LongPass1" }),
    ).rejects.toThrow("Invalid or expired invitation.");
  });

  it("throws for already-used invitation", async () => {
    repo.findByTokenHash.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "used@test.com",
      name: null,
      tokenHash: "hash",
      status: "accepted",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      invitationService.accept({ token: "some-token", password: "LongPass1" }),
    ).rejects.toThrow("This invitation has already been used or expired.");
  });

  it("marks expired invitation and throws", async () => {
    repo.findByTokenHash.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "expired@test.com",
      name: null,
      tokenHash: "hash",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      invitationService.accept({ token: "expired-token", password: "LongPass1" }),
    ).rejects.toThrow("This invitation has expired.");
    expect(repo.updateStatus).toHaveBeenCalledWith("inv-1", "expired");
  });

  it("uses email username as name when none provided", async () => {
    repo.findByTokenHash.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "noname@test.com",
      name: null,
      tokenHash: "hash",
      status: "pending",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userSvc.registerForCurrentWorkspace.mockResolvedValue({ id: "user-1" } as never);

    await invitationService.accept({
      token: "raw-token",
      password: "LongPass1",
    });

    expect(userSvc.registerForCurrentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "noname" }),
    );
  });

  it("throws if user registration returns null", async () => {
    repo.findByTokenHash.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "fail@test.com",
      name: null,
      tokenHash: "hash",
      status: "pending",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userSvc.registerForCurrentWorkspace.mockResolvedValue(null as never);

    await expect(
      invitationService.accept({ token: "raw-token", password: "LongPass1" }),
    ).rejects.toThrow("Failed to create user account.");
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
});

describe("invitationService.list", () => {
  it("returns all invitations", async () => {
    repo.list.mockResolvedValue([
      {
        id: "inv-1",
        env: "dev",
        email: "a@b.com",
        name: null,
        tokenHash: "h",
        status: "pending",
        expiresAt: new Date(),
        invitedBy: "admin-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await invitationService.list();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("a@b.com");
  });
});

describe("invitationService.revoke", () => {
  it("revokes a pending invitation", async () => {
    repo.findById.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "a@b.com",
      name: null,
      tokenHash: "h",
      status: "pending",
      expiresAt: new Date(),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await invitationService.revoke("inv-1");
    expect(repo.updateStatus).toHaveBeenCalledWith("inv-1", "expired");
  });

  it("throws if invitation not found", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(invitationService.revoke("bad-id")).rejects.toThrow(
      "Invitation not found.",
    );
  });

  it("throws if invitation is not pending", async () => {
    repo.findById.mockResolvedValue({
      id: "inv-1",
      env: "dev",
      email: "a@b.com",
      name: null,
      tokenHash: "h",
      status: "accepted",
      expiresAt: new Date(),
      invitedBy: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(invitationService.revoke("inv-1")).rejects.toThrow(
      "Only pending invitations can be revoked.",
    );
  });
});
