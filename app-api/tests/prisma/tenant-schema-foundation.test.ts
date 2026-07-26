import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(
  path.join(process.cwd(), "prisma", "schema.prisma"),
  "utf8",
);

const LEGACY_SCOPED_MODELS = [
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
] as const;

function modelBlock(name: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"),
  );
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[1];
}

describe("tenant schema foundation", () => {
  it("adds nullable tenantId staging fields to every legacy scoped model", () => {
    expect(LEGACY_SCOPED_MODELS).toHaveLength(19);

    for (const model of LEGACY_SCOPED_MODELS) {
      const block = modelBlock(model);
      expect(block, `${model} should retain env during staged cutover`).toMatch(
        /\benv\s+String/,
      );
      expect(block, `${model} should stage tenantId`).toMatch(
        /\btenantId\s+String\?\s+@db\.ObjectId/,
      );
    }
  });

  it("adds the accepted tenant, organization, and domain boundaries", () => {
    const tenant = modelBlock("Tenant");
    expect(tenant).toMatch(/\bkey\s+String\s+@unique/);
    expect(tenant).toMatch(/\borganization\s+Organization\?/);
    expect(tenant).not.toMatch(/\benv\s+String/);

    const domain = modelBlock("TenantDomain");
    expect(domain).toMatch(/\btenantId\s+String\s+@db\.ObjectId/);
    expect(domain).toMatch(/\bhost\s+String\s+@unique/);

    const organization = modelBlock("Organization");
    expect(organization).toMatch(
      /\btenantId\s+String\s+@unique\s+@db\.ObjectId/,
    );
    expect(organization).toMatch(/\bmemberships\s+OrganizationMembership\[\]/);
  });

  it("moves future sub-user hierarchy to organization membership context", () => {
    const membership = modelBlock("OrganizationMembership");
    expect(membership).toMatch(/\borganizationId\s+String\s+@db\.ObjectId/);
    expect(membership).toMatch(/\buserId\s+String\s+@db\.ObjectId/);
    expect(membership).toMatch(
      /\bparentMembershipId\s+String\?\s+@db\.ObjectId/,
    );
    expect(membership).toMatch(/\bancestors\s+String\[\]\s+@db\.ObjectId/);
    expect(membership).toContain('@@unique([organizationId, userId])');
  });

  it("adds provider-neutral global external identities", () => {
    const identity = modelBlock("ExternalIdentity");
    expect(identity).toMatch(/\buserId\s+String\s+@db\.ObjectId/);
    expect(identity).toMatch(/\bprovider\s+String/);
    expect(identity).toMatch(/\bsubject\s+String/);
    expect(identity).toContain("@@unique([provider, subject])");
    expect(identity).not.toMatch(/\btenantId\s+/);
    expect(identity).not.toMatch(/\benv\s+/);
  });

  it("keeps platform administrator and SystemConfig models global", () => {
    for (const model of ["Admin", "AdminSession", "SystemConfig"]) {
      const block = modelBlock(model);
      expect(block).not.toMatch(/\btenantId\s+/);
      expect(block).not.toMatch(/\benv\s+/);
    }
  });
});
