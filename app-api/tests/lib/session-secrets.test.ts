import { afterEach, describe, expect, it } from "vitest";
import {
  getSessionSecret,
  getUserSessionSecret,
} from "@/lib/session-secrets";

const originalAdmin = process.env.ADMIN_SESSION_SECRET;
const originalUser = process.env.USER_SESSION_SECRET;

afterEach(() => {
  if (originalAdmin === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalAdmin;

  if (originalUser === undefined) delete process.env.USER_SESSION_SECRET;
  else process.env.USER_SESSION_SECRET = originalUser;
});

describe("session secrets", () => {
  it("returns configured administrator and member secrets", () => {
    process.env.ADMIN_SESSION_SECRET = "a".repeat(32);
    process.env.USER_SESSION_SECRET = "u".repeat(32);

    expect(getSessionSecret()).toBe("a".repeat(32));
    expect(getUserSessionSecret()).toBe("u".repeat(32));
  });

  it("rejects missing or short administrator secrets", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => getSessionSecret()).toThrow(
      "ADMIN_SESSION_SECRET must be set and at least 32 characters",
    );

    process.env.ADMIN_SESSION_SECRET = "short";
    expect(() => getSessionSecret()).toThrow(
      "ADMIN_SESSION_SECRET must be set and at least 32 characters",
    );
  });

  it("rejects missing or short member secrets", () => {
    delete process.env.USER_SESSION_SECRET;
    expect(() => getUserSessionSecret()).toThrow(
      "USER_SESSION_SECRET must be set and at least 32 characters",
    );

    process.env.USER_SESSION_SECRET = "short";
    expect(() => getUserSessionSecret()).toThrow(
      "USER_SESSION_SECRET must be set and at least 32 characters",
    );
  });
});
