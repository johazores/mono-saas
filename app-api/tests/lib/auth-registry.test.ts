import { describe, expect, it } from "vitest";
import {
  getAuthProvider,
  getAuthProviderRegistration,
} from "@/lib/auth/index";

describe("auth provider registry", () => {
  it("registers credentials and Clerk behind the same contract", () => {
    expect(getAuthProvider("credentials").name).toBe("credentials");
    expect(getAuthProvider("clerk").name).toBe("clerk");
    expect(
      typeof getAuthProviderRegistration("credentials").resolveIdentity,
    ).toBe("function");
    expect(typeof getAuthProviderRegistration("clerk").resolveIdentity).toBe(
      "function",
    );
  });

  it("fails closed for an unknown provider", () => {
    expect(() => getAuthProvider("unknown")).toThrow(
      "Unknown authentication provider",
    );
  });
});
