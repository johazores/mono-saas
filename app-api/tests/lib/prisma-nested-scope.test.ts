import { describe, expect, it } from "vitest";
import { applyEnvScope } from "@/lib/prisma-scope";

describe("nested relation count scope", () => {
  it("filters relation counts to the active environment", () => {
    const args = applyEnvScope(
      "findFirst",
      {
        include: {
          _count: {
            select: {
              purchases: true,
              memberships: { where: { env: "production", status: "active" } },
            },
          },
        },
      },
      "dev",
      "User",
    );

    expect(args).toEqual({
      where: { env: "dev" },
      include: {
        _count: {
          select: {
            purchases: { where: { env: "dev" } },
            memberships: { where: { env: "dev", status: "active" } },
          },
        },
      },
    });
  });

  it("does not rewrite env-shaped keys inside JSON data", () => {
    const args = applyEnvScope(
      "update",
      {
        where: { id: "purchase-id" },
        data: {
          metadata: {
            env: "provider-value",
            nested: { env: "another-provider-value" },
          },
        },
      },
      "dev",
      "Purchase",
    );

    expect(args.data).toEqual({
      env: "dev",
      metadata: {
        env: "provider-value",
        nested: { env: "another-provider-value" },
      },
    });
  });
});
