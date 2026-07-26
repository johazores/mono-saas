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

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateArgs(argv) {
  let tenantKey = "";
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--tenant-key") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --tenant-key.");
      }
      tenantKey = value.trim().toLowerCase();
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (help) return { help: true, tenantKey: "" };
  if (!tenantKey) throw new Error("--tenant-key is required.");
  if (!KEY_PATTERN.test(tenantKey)) {
    throw new Error("--tenant-key must be lowercase alphanumeric with hyphens.");
  }
  return { help: false, tenantKey };
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
  const args = validateArgs(process.argv.slice(2));
  if (args.help) {
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
