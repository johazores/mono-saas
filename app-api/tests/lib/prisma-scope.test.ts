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
