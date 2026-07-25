import { beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => ({
  validateBootstrapEnv: vi.fn(),
}));

vi.mock("@/lib/bootstrap-env", () => ({
  validateBootstrapEnv: bootstrap.validateBootstrapEnv,
}));

import { register } from "@/instrumentation";

beforeEach(() => vi.clearAllMocks());

describe("instrumentation.register", () => {
  it("validates bootstrap configuration when the server starts", () => {
    register();

    expect(bootstrap.validateBootstrapEnv).toHaveBeenCalledTimes(1);
  });

  it("does not swallow bootstrap validation failures", () => {
    bootstrap.validateBootstrapEnv.mockImplementationOnce(() => {
      throw new Error("invalid bootstrap config");
    });

    expect(() => register()).toThrow("invalid bootstrap config");
  });
});
