import { describe, expect, it } from "vitest";
import {
  applyTenantStagingCreates,
  getTenantStagedModelNames,
} from "@/lib/prisma-tenant-staging";

function apply(
  operation: string,
  model: string,
  args: Record<string, unknown>,
) {
  return applyTenantStagingCreates(operation, args, "tenant-trusted", model);
}

describe("tenant staging model discovery", () => {
  it("derives the 19 legacy env plus tenantId models from Prisma metadata", () => {
    const models = getTenantStagedModelNames();

    expect(models).toHaveLength(19);
    expect(models).toEqual(
      expect.arrayContaining([
        "User",
        "UserSession",
        "UserInvitation",
        "ActivityLog",
        "Product",
        "ProductPrice",
        "Purchase",
        "PurchaseFile",
        "Membership",
        "Feature",
        "SiteSetting",
        "CheckoutSession",
        "Page",
        "ContentType",
        "ContentItem",
        "Taxonomy",
        "TaxonomyTerm",
        "Media",
        "BlockTemplate",
      ]),
    );
    expect(models).not.toContain("Tenant");
    expect(models).not.toContain("Admin");
    expect(models).not.toContain("SystemConfig");
  });
});

describe("applyTenantStagingCreates", () => {
  it("overwrites caller tenantId on create with trusted request context", () => {
    const args = {
      data: {
        email: "user@example.com",
        tenantId: "attacker-selected",
      },
    };

    apply("create", "User", args);

    expect(args.data.tenantId).toBe("tenant-trusted");
  });

  it("stamps every createMany record", () => {
    const args = {
      data: [
        { key: "feature-a" },
        { key: "feature-b", tenantId: "wrong" },
      ],
    };

    apply("createMany", "Feature", args);

    expect(args.data).toEqual([
      { key: "feature-a", tenantId: "tenant-trusted" },
      { key: "feature-b", tenantId: "tenant-trusted" },
    ]);
  });

  it("removes caller tenantId from an existing-row update", () => {
    const args = {
      data: {
        name: "Updated",
        tenantId: { set: "attacker-selected" },
      },
    };

    apply("update", "Product", args);

    expect(args.data).toEqual({ name: "Updated" });
  });

  it("stamps nested creates during an update without retagging the parent", () => {
    const args = {
      data: {
        tenantId: "attacker-selected",
        prices: {
          create: {
            label: "Monthly",
            tenantId: "wrong-child",
          },
        },
      },
    };

    apply("update", "Product", args);

    expect(args.data).not.toHaveProperty("tenantId");
    expect(args.data.prices.create).toEqual({
      label: "Monthly",
      tenantId: "tenant-trusted",
    });
  });

  it("stamps nested createMany and connectOrCreate create branches", () => {
    const args = {
      data: {
        purchases: {
          createMany: {
            data: [{ amount: 10 }, { amount: 20, tenantId: "wrong" }],
          },
        },
        sessions: {
          connectOrCreate: {
            where: { tokenHash: "hash" },
            create: {
              tokenHash: "hash",
              expiresAt: new Date(),
              tenantId: "wrong",
            },
          },
        },
      },
    };

    apply("create", "User", args);

    expect(args.data.tenantId).toBe("tenant-trusted");
    expect(args.data.purchases.createMany.data).toEqual([
      { amount: 10, tenantId: "tenant-trusted" },
      { amount: 20, tenantId: "tenant-trusted" },
    ]);
    expect(args.data.sessions.connectOrCreate.create.tenantId).toBe(
      "tenant-trusted",
    );
  });

  it("stamps the upsert create branch but never retags the update branch", () => {
    const args = {
      create: {
        slug: "new-page",
        tenantId: "wrong-create",
      },
      update: {
        title: "Updated",
        tenantId: "wrong-update",
      },
    };

    apply("upsert", "Page", args);

    expect(args.create.tenantId).toBe("tenant-trusted");
    expect(args.update).toEqual({ title: "Updated" });
  });

  it("stamps nested upsert creates while stripping nested update tenantId", () => {
    const args = {
      data: {
        prices: {
          upsert: {
            where: { id: "price-1" },
            create: { label: "New", tenantId: "wrong" },
            update: { label: "Old", tenantId: "wrong" },
          },
        },
      },
    };

    apply("update", "Product", args);

    expect(args.data.prices.upsert.create.tenantId).toBe("tenant-trusted");
    expect(args.data.prices.upsert.update).toEqual({ label: "Old" });
  });

  it("does not stamp global models", () => {
    const args = { data: { key: "GLOBAL", tenantId: "caller-value" } };

    apply("create", "SystemConfig", args);

    expect(args.data.tenantId).toBe("caller-value");
  });
});
