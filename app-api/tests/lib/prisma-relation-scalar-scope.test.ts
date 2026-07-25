import { describe, expect, it } from "vitest";
import { applyEnvScope } from "@/lib/prisma-scope";

describe("direct relation scalar write scope", () => {
  it("normalizes a scoped relation id into a scoped connect", () => {
    const args = applyEnvScope(
      "create",
      {
        data: {
          userId: "user-id",
          tokenHash: "hash",
          expiresAt: new Date("2026-07-25T12:00:00Z"),
        },
      },
      "dev",
      "UserSession",
    );

    expect(args.data).toEqual({
      env: "dev",
      tokenHash: "hash",
      expiresAt: new Date("2026-07-25T12:00:00Z"),
      user: { connect: { env: "dev", id: "user-id" } },
    });
  });

  it("normalizes unchecked relation id updates without changing null disconnects", () => {
    const linked = applyEnvScope(
      "update",
      {
        where: { id: "child-id" },
        data: { parentId: { set: "parent-id" } },
      },
      "dev",
      "User",
    );

    expect(linked.data).toEqual({
      env: "dev",
      parent: { connect: { env: "dev", id: "parent-id" } },
    });

    const disconnected = applyEnvScope(
      "update",
      {
        where: { id: "child-id" },
        data: { parentId: null },
      },
      "dev",
      "User",
    );

    expect(disconnected.data).toEqual({
      env: "dev",
      parentId: null,
    });
  });

  it("normalizes CMS relation scalar writes using schema metadata", () => {
    const args = applyEnvScope(
      "create",
      {
        data: {
          contentTypeId: "type-id",
          contentTypeSlug: "blog",
          slug: "post",
          title: "Post",
          data: {},
        },
      },
      "dev",
      "ContentItem",
    );

    expect(args.data).toEqual({
      env: "dev",
      contentTypeSlug: "blog",
      slug: "post",
      title: "Post",
      data: {},
      contentType: { connect: { env: "dev", id: "type-id" } },
    });
  });
});
