import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY_SCOPED_DELEGATES = [
  ["User", "user"],
  ["UserSession", "userSession"],
  ["UserInvitation", "userInvitation"],
  ["ActivityLog", "activityLog"],
  ["Product", "product"],
  ["ProductPrice", "productPrice"],
  ["Purchase", "purchase"],
  ["PurchaseFile", "purchaseFile"],
  ["Membership", "membership"],
  ["Feature", "feature"],
  ["SiteSetting", "siteSetting"],
  ["CheckoutSession", "checkoutSession"],
  ["Page", "page"],
  ["ContentType", "contentType"],
  ["ContentItem", "contentItem"],
  ["Taxonomy", "taxonomy"],
  ["TaxonomyTerm", "taxonomyTerm"],
  ["Media", "media"],
  ["BlockTemplate", "blockTemplate"],
];

function hasHelpFlag(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function normalizeHost(rawHost) {
  if (typeof rawHost !== "string") return null;
  const trimmed = rawHost.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(`http://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

async function verifyTenantOwnership() {
  const failures = [];
  const tenants = await prisma.tenant.findMany({
    select: { id: true, key: true },
  });
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));

  for (const [modelName, delegateName] of LEGACY_SCOPED_DELEGATES) {
    const rows = await prisma[delegateName].findMany({
      where: { tenantId: { not: null } },
      select: { id: true, tenantId: true },
    });

    for (const row of rows) {
      if (!tenantIds.has(row.tenantId)) {
        failures.push(
          `${modelName} ${row.id} references missing tenant ${row.tenantId}.`,
        );
      }
    }
  }

  const domains = await prisma.tenantDomain.findMany({
    select: { id: true, tenantId: true, host: true },
  });
  const normalizedHosts = new Map();

  for (const domain of domains) {
    if (!tenantIds.has(domain.tenantId)) {
      failures.push(
        `TenantDomain ${domain.id} references missing tenant ${domain.tenantId}.`,
      );
    }

    const normalized = normalizeHost(domain.host);
    if (!normalized) {
      failures.push(`TenantDomain ${domain.id} has invalid host ${domain.host}.`);
      continue;
    }
    if (normalized !== domain.host) {
      failures.push(
        `TenantDomain ${domain.id} host ${domain.host} is not canonical; expected ${normalized}.`,
      );
    }

    const previous = normalizedHosts.get(normalized);
    if (previous) {
      failures.push(
        `TenantDomain normalized-host collision for ${normalized}: ${previous} and ${domain.id}.`,
      );
    } else {
      normalizedHosts.set(normalized, domain.id);
    }
  }

  if (failures.length > 0) {
    console.error(
      JSON.stringify(
        {
          ready: false,
          stage: "tenant-ownership",
          failureCount: failures.length,
          failures,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return false;
  }

  return true;
}

async function main() {
  if (hasHelpFlag(process.argv.slice(2))) {
    await prisma.$disconnect();
    await import("./verify-tenant-cutover.mjs");
    return;
  }

  const valid = await verifyTenantOwnership();
  await prisma.$disconnect();
  if (!valid) return;

  await import("./verify-tenant-cutover.mjs");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  await prisma.$disconnect().catch(() => undefined);
});
