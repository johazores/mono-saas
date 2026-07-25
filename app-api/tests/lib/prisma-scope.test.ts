import { describe, expect, it } from "vitest";
import {
  applyEnvScope,
  getEnvScopedModelNames,
  isEnvScopedModel,
} from "@/lib/prisma-scope";

describe("schema-derived environment models", () => {
  it("includes every model carrying env, including UserInvitation", () => {
    const models = getEnvScopedModelNames();

    expect(models).toContain("User");
    expect(models).toContain("UserInvitation");
    expect(models).toContain("SiteSetting");
    expect(models).toHaveLength(19);
  });

  it("does not scope global models", () => {
    expect(isEnvScopedModel("Admin")).toBe(false);
    expect(isEnvScopedModel("AdminSession")).toBe(false);
    expect(isEnvScopedModel("SystemConfig")).toBe(false);
  });
});

describe("applyEnvScope", () => {
  it("creates a where clause for findFirst without filters", () => {
    const args = applyEnvScope("findFirst", {}, "dev");
    expect(args).toEqual({ where: { env: "dev" } });
  });

  it("overwrites a caller-provided top-level environment", () => {
    const args = applyEnvScope(
      "findMany",
      { where: { env: "production", status: "active" } },
      "dev",
    );

    expect(args.where).toEqual({ env: "dev", status: "active" });
  });

  it("overwrites environment inside compound unique selectors", () => {
    const args = applyEnvScope(
      "findUnique",
      {
        where: {
          env_email: { env: "production", email: "user@example.com" },
        },
      },
      "dev",
    );

    expect(args.where).toEqual({
      env: "dev",
      env_email: { env: "dev", email: "user@example.com" },
    });
  });

  it("overwrites explicit environment values in logical and relation filters", () => {
    const args = applyEnvScope(
      "findMany",
      {
        where: {
          OR: [
            { env: "production", status: "active" },
            { product: { is: { env: "production", isActive: true } } },
          ],
        },
      },
      "dev",
    );

    expect(args.where).toEqual({
      env: "dev",
      OR: [
        { env: "dev", status: "active" },
        { product: { is: { env: "dev", isActive: true } } },
      ],
    });
  });

  it("prevents create and update operations from moving records across environments", () => {
    const create = applyEnvScope(
      "create",
      { data: { env: "production", name: "Example" } },
      "dev",
    );
    const update = applyEnvScope(
      "update",
      {
        where: { id: "record-id", env: "production" },
        data: { env: "production", name: "Updated" },
      },
      "dev",
    );

    expect(create.data).toEqual({ env: "dev", name: "Example" });
    expect(update).toEqual({
      where: { id: "record-id", env: "dev" },
      data: { env: "dev", name: "Updated" },
    });
  });

  it("scopes every createMany row", () => {
    const args = applyEnvScope(
      "createMany",
      {
        data: [
          { env: "production", name: "One" },
          { name: "Two" },
        ],
      },
      "dev",
    );

    expect(args.data).toEqual([
      { env: "dev", name: "One" },
      { env: "dev", name: "Two" },
    ]);
  });

  it("scopes both sides of an upsert", () => {
    const args = applyEnvScope(
      "upsert",
      {
        where: {
          env_key: { env: "production", key: "site.title" },
        },
        create: { env: "production", key: "site.title", value: "New" },
        update: { env: "production", value: "Updated" },
      },
      "dev",
    );

    expect(args).toEqual({
      where: {
        env: "dev",
        env_key: { env: "dev", key: "site.title" },
      },
      create: { env: "dev", key: "site.title", value: "New" },
      update: { env: "dev", value: "Updated" },
    });
  });
});

describe("nested relation read scope", () => {
  it("filters list includes to the active environment", () => {
    const args = applyEnvScope(
      "findMany",
      { include: { purchases: true } },
      "dev",
      "User",
    );

    expect(args).toEqual({
      where: { env: "dev" },
      include: {
        purchases: { where: { env: "dev" } },
      },
    });
  });

  it("constrains required to-one includes at the parent query", () => {
    const args = applyEnvScope(
      "findMany",
      { include: { user: true, product: true } },
      "dev",
      "Purchase",
    );

    expect(args.where).toEqual({
      env: "dev",
      AND: [
        { user: { is: { env: "dev" } } },
        { product: { is: { env: "dev" } } },
      ],
    });
  });

  it("allows an optional to-one relation to be null but never cross-scope", () => {
    const args = applyEnvScope(
      "findFirst",
      { include: { parent: true } },
      "dev",
      "User",
    );

    expect(args.where).toEqual({
      env: "dev",
      AND: [
        {
          OR: [
            { parent: { is: null } },
            { parent: { is: { env: "dev" } } },
          ],
        },
      ],
    });
  });

  it("scopes nested list and to-one selections recursively", () => {
    const args = applyEnvScope(
      "findMany",
      {
        include: {
          user: {
            include: {
              parent: true,
              purchases: { include: { product: true } },
            },
          },
        },
      },
      "dev",
      "Purchase",
    );

    expect(args.include).toEqual({
      user: {
        include: {
          parent: true,
          purchases: {
            include: { product: true },
            where: {
              env: "dev",
              AND: [{ product: { is: { env: "dev" } } }],
            },
          },
        },
      },
    });

    expect(args.where).toEqual({
      env: "dev",
      AND: [
        {
          user: {
            is: {
              env: "dev",
              AND: [
                {
                  OR: [
                    { parent: { is: null } },
                    { parent: { is: { env: "dev" } } },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
  });
});

describe("nested relation write scope", () => {
  it("scopes nested connects and creates", () => {
    const args = applyEnvScope(
      "create",
      {
        data: {
          amount: 10,
          currency: "USD",
          user: { connect: { id: "user-id", env: "production" } },
          product: { connect: { id: "product-id" } },
          files: {
            create: {
              fileName: "guide.pdf",
              data: "base64",
              env: "production",
            },
          },
        },
      },
      "dev",
      "Purchase",
    );

    expect(args.data).toEqual({
      env: "dev",
      amount: 10,
      currency: "USD",
      user: { connect: { id: "user-id", env: "dev" } },
      product: { connect: { id: "product-id", env: "dev" } },
      files: {
        create: {
          fileName: "guide.pdf",
          data: "base64",
          env: "dev",
        },
      },
    });
  });

  it("scopes connectOrCreate and nested upsert branches", () => {
    const args = applyEnvScope(
      "update",
      {
        where: { id: "user-id" },
        data: {
          purchases: {
            connectOrCreate: {
              where: { id: "purchase-id", env: "production" },
              create: {
                amount: 20,
                currency: "USD",
                product: { connect: { id: "product-id" } },
              },
            },
            upsert: {
              where: { id: "purchase-two" },
              create: {
                amount: 30,
                currency: "USD",
                product: { connect: { id: "product-two" } },
              },
              update: {
                product: { connect: { id: "product-three" } },
              },
            },
          },
        },
      },
      "dev",
      "User",
    );

    const purchases = (args.data as Record<string, unknown>).purchases as Record<
      string,
      Record<string, unknown>
    >;

    expect(purchases.connectOrCreate.where).toEqual({
      id: "purchase-id",
      env: "dev",
    });
    expect(purchases.connectOrCreate.create).toMatchObject({
      env: "dev",
      product: { connect: { id: "product-id", env: "dev" } },
    });
    expect(purchases.upsert.where).toEqual({
      id: "purchase-two",
      env: "dev",
    });
    expect(purchases.upsert.create).toMatchObject({
      env: "dev",
      product: { connect: { id: "product-two", env: "dev" } },
    });
    expect(purchases.upsert.update).toMatchObject({
      env: "dev",
      product: { connect: { id: "product-three", env: "dev" } },
    });
  });

  it("scopes nested updateMany and deleteMany filters", () => {
    const args = applyEnvScope(
      "update",
      {
        where: { id: "user-id" },
        data: {
          purchases: {
            updateMany: {
              where: { status: "pending", env: "production" },
              data: { status: "cancelled", env: "production" },
            },
            deleteMany: { status: "failed", env: "production" },
          },
        },
      },
      "dev",
      "User",
    );

    const purchases = (args.data as Record<string, unknown>).purchases as Record<
      string,
      Record<string, unknown>
    >;

    expect(purchases.updateMany).toEqual({
      where: { status: "pending", env: "dev" },
      data: { status: "cancelled", env: "dev" },
    });
    expect(purchases.deleteMany).toEqual({
      status: "failed",
      env: "dev",
    });
  });
});
