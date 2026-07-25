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

function parseArgs(argv) {
  let help = false;
  let tenantKey = "";

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

function printHelp() {
  console.log(`Tenant cutover verifier (read-only)

Usage:
  node scripts/verify-tenant-cutover.mjs --tenant-key default

The command performs no writes. It verifies global staging completeness plus
relations, memberships, external identities, known soft references, and final
unique-index readiness before runtime scope can switch from env to tenantId.`);
}

function addFailure(failures, message) {
  if (failures.length < 500) failures.push(message);
}

function tenantMismatch(failures, label, rowId, expected, actual) {
  if (!actual || actual !== expected) {
    addFailure(
      failures,
      `${label} ${rowId} tenant mismatch: expected ${expected}, got ${actual ?? "null"}.`,
    );
  }
}

function findDuplicateKeys(rows, keyForRow, label, failures) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    const previous = seen.get(key);
    if (previous) {
      addFailure(failures, `${label} collision for ${key}: ${previous} and ${row.id}.`);
    } else {
      seen.set(key, row.id);
    }
  }
}

async function verifyNoMissingTenantIds(failures, summary) {
  for (const [modelName, delegateName] of LEGACY_SCOPED_DELEGATES) {
    const delegate = prisma[delegateName];
    const total = await delegate.count();
    const missing = await delegate.count({ where: { tenantId: null } });
    summary.scopedModels.push({ model: modelName, total, missingTenantId: missing });
    if (missing > 0) {
      addFailure(failures, `${modelName} has ${missing} row(s) without tenantId.`);
    }
  }
}

async function loadReferenceData() {
  const [
    users,
    sessions,
    products,
    prices,
    purchases,
    files,
    memberships,
    checkouts,
    features,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
    organizations,
    organizationMemberships,
    externalIdentities,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        tenantId: true,
        email: true,
        clerkId: true,
        parentId: true,
        ancestors: true,
      },
    }),
    prisma.userSession.findMany({
      select: { id: true, tenantId: true, userId: true },
    }),
    prisma.product.findMany({
      select: { id: true, tenantId: true, slug: true, accessKeys: true },
    }),
    prisma.productPrice.findMany({
      select: { id: true, tenantId: true, productId: true },
    }),
    prisma.purchase.findMany({
      select: { id: true, tenantId: true, userId: true, productId: true },
    }),
    prisma.purchaseFile.findMany({
      select: { id: true, tenantId: true, purchaseId: true },
    }),
    prisma.membership.findMany({
      select: {
        id: true,
        tenantId: true,
        userId: true,
        sourceId: true,
        featureKeys: true,
      },
    }),
    prisma.checkoutSession.findMany({
      select: { id: true, tenantId: true, userId: true, items: true },
    }),
    prisma.feature.findMany({
      select: { id: true, tenantId: true, key: true },
    }),
    prisma.contentType.findMany({
      select: { id: true, tenantId: true, slug: true },
    }),
    prisma.contentItem.findMany({
      select: {
        id: true,
        tenantId: true,
        contentTypeId: true,
        contentTypeSlug: true,
        slug: true,
      },
    }),
    prisma.taxonomy.findMany({
      select: { id: true, tenantId: true, slug: true, contentTypes: true },
    }),
    prisma.taxonomyTerm.findMany({
      select: {
        id: true,
        tenantId: true,
        taxonomyId: true,
        parentId: true,
        slug: true,
      },
    }),
    prisma.organization.findMany({
      select: { id: true, tenantId: true, slug: true },
    }),
    prisma.organizationMembership.findMany({
      select: {
        id: true,
        tenantId: true,
        organizationId: true,
        userId: true,
        parentMembershipId: true,
        ancestors: true,
      },
    }),
    prisma.externalIdentity.findMany({
      select: { id: true, userId: true, provider: true, subject: true },
    }),
  ]);

  return {
    users,
    sessions,
    products,
    prices,
    purchases,
    files,
    memberships,
    checkouts,
    features,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
    organizations,
    organizationMemberships,
    externalIdentities,
  };
}

function verifyRelations(data, failures) {
  const users = new Map(data.users.map((row) => [row.id, row]));
  const products = new Map(data.products.map((row) => [row.id, row]));
  const prices = new Map(data.prices.map((row) => [row.id, row]));
  const purchases = new Map(data.purchases.map((row) => [row.id, row]));
  const contentTypes = new Map(data.contentTypes.map((row) => [row.id, row]));
  const taxonomies = new Map(data.taxonomies.map((row) => [row.id, row]));
  const taxonomyTerms = new Map(data.taxonomyTerms.map((row) => [row.id, row]));

  for (const session of data.sessions) {
    const user = users.get(session.userId);
    if (!user) {
      addFailure(failures, `UserSession ${session.id} references missing user ${session.userId}.`);
      continue;
    }
    tenantMismatch(failures, "UserSession", session.id, user.tenantId, session.tenantId);
  }

  for (const price of data.prices) {
    const product = products.get(price.productId);
    if (!product) {
      addFailure(failures, `ProductPrice ${price.id} references missing product ${price.productId}.`);
      continue;
    }
    tenantMismatch(failures, "ProductPrice", price.id, product.tenantId, price.tenantId);
  }

  for (const purchase of data.purchases) {
    const user = users.get(purchase.userId);
    const product = products.get(purchase.productId);
    if (!user) addFailure(failures, `Purchase ${purchase.id} references missing user ${purchase.userId}.`);
    if (!product) addFailure(failures, `Purchase ${purchase.id} references missing product ${purchase.productId}.`);
    if (user) tenantMismatch(failures, "Purchase/user", purchase.id, user.tenantId, purchase.tenantId);
    if (product) tenantMismatch(failures, "Purchase/product", purchase.id, product.tenantId, purchase.tenantId);
  }

  for (const file of data.files) {
    const purchase = purchases.get(file.purchaseId);
    if (!purchase) {
      addFailure(failures, `PurchaseFile ${file.id} references missing purchase ${file.purchaseId}.`);
      continue;
    }
    tenantMismatch(failures, "PurchaseFile", file.id, purchase.tenantId, file.tenantId);
  }

  for (const membership of data.memberships) {
    const user = users.get(membership.userId);
    const purchase = purchases.get(membership.sourceId);
    if (!user) addFailure(failures, `Membership ${membership.id} references missing user ${membership.userId}.`);
    if (!purchase) addFailure(failures, `Membership ${membership.id} references missing purchase ${membership.sourceId}.`);
    if (user) tenantMismatch(failures, "Membership/user", membership.id, user.tenantId, membership.tenantId);
    if (purchase) tenantMismatch(failures, "Membership/source", membership.id, purchase.tenantId, membership.tenantId);
  }

  for (const item of data.contentItems) {
    const contentType = contentTypes.get(item.contentTypeId);
    if (!contentType) {
      addFailure(failures, `ContentItem ${item.id} references missing content type ${item.contentTypeId}.`);
      continue;
    }
    tenantMismatch(failures, "ContentItem", item.id, contentType.tenantId, item.tenantId);
    if (item.contentTypeSlug !== contentType.slug) {
      addFailure(
        failures,
        `ContentItem ${item.id} contentTypeSlug ${item.contentTypeSlug} does not match ${contentType.slug}.`,
      );
    }
  }

  for (const term of data.taxonomyTerms) {
    const taxonomy = taxonomies.get(term.taxonomyId);
    if (!taxonomy) {
      addFailure(failures, `TaxonomyTerm ${term.id} references missing taxonomy ${term.taxonomyId}.`);
      continue;
    }
    tenantMismatch(failures, "TaxonomyTerm", term.id, taxonomy.tenantId, term.tenantId);
    if (term.parentId) {
      const parent = taxonomyTerms.get(term.parentId);
      if (!parent || parent.taxonomyId !== term.taxonomyId) {
        addFailure(failures, `TaxonomyTerm ${term.id} has an invalid parent ${term.parentId}.`);
      } else {
        tenantMismatch(failures, "TaxonomyTerm parent", term.id, term.tenantId, parent.tenantId);
      }
    }
  }

  for (const checkout of data.checkouts) {
    if (checkout.userId) {
      const user = users.get(checkout.userId);
      if (!user) {
        addFailure(failures, `CheckoutSession ${checkout.id} references missing user ${checkout.userId}.`);
      } else {
        tenantMismatch(failures, "CheckoutSession/user", checkout.id, user.tenantId, checkout.tenantId);
      }
    }

    if (!Array.isArray(checkout.items)) {
      addFailure(failures, `CheckoutSession ${checkout.id} items is not an array.`);
      continue;
    }
    for (const [index, value] of checkout.items.entries()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        addFailure(failures, `CheckoutSession ${checkout.id} item ${index} is invalid.`);
        continue;
      }
      const productId = typeof value.productId === "string" ? value.productId : null;
      if (!productId || !products.has(productId)) {
        addFailure(failures, `CheckoutSession ${checkout.id} item ${index} has invalid productId.`);
        continue;
      }
      const product = products.get(productId);
      tenantMismatch(failures, "CheckoutSession/product", checkout.id, product.tenantId, checkout.tenantId);

      const priceId = typeof value.priceId === "string" ? value.priceId : null;
      if (priceId && prices.has(priceId)) {
        const price = prices.get(priceId);
        tenantMismatch(failures, "CheckoutSession/price", checkout.id, price.tenantId, checkout.tenantId);
      }
    }
  }
}

function verifyFeatureAndTaxonomyKeys(data, failures) {
  const featureKeysByTenant = new Map();
  for (const feature of data.features) {
    const keys = featureKeysByTenant.get(feature.tenantId) ?? new Set();
    keys.add(feature.key);
    featureKeysByTenant.set(feature.tenantId, keys);
  }

  for (const product of data.products) {
    const keys = featureKeysByTenant.get(product.tenantId) ?? new Set();
    for (const key of product.accessKeys) {
      if (!keys.has(key)) {
        addFailure(failures, `Product ${product.id} access key ${key} is missing in tenant ${product.tenantId}.`);
      }
    }
  }

  for (const membership of data.memberships) {
    const keys = featureKeysByTenant.get(membership.tenantId) ?? new Set();
    for (const key of membership.featureKeys) {
      if (!keys.has(key)) {
        addFailure(failures, `Membership ${membership.id} feature key ${key} is missing in tenant ${membership.tenantId}.`);
      }
    }
  }

  const contentTypeSlugsByTenant = new Map();
  for (const contentType of data.contentTypes) {
    const slugs = contentTypeSlugsByTenant.get(contentType.tenantId) ?? new Set();
    slugs.add(contentType.slug);
    contentTypeSlugsByTenant.set(contentType.tenantId, slugs);
  }
  for (const taxonomy of data.taxonomies) {
    const slugs = contentTypeSlugsByTenant.get(taxonomy.tenantId) ?? new Set();
    for (const contentTypeSlug of taxonomy.contentTypes) {
      if (!slugs.has(contentTypeSlug)) {
        addFailure(
          failures,
          `Taxonomy ${taxonomy.id} content type ${contentTypeSlug} is missing in tenant ${taxonomy.tenantId}.`,
        );
      }
    }
  }
}

function verifyFinalUniqueKeys(data, failures) {
  const scopedRows = (rows) => rows.filter((row) => row.tenantId);

  findDuplicateKeys(
    scopedRows(data.products),
    (row) => `${row.tenantId}|${row.slug}`,
    "Product tenant+slug",
    failures,
  );
  findDuplicateKeys(
    scopedRows(data.features),
    (row) => `${row.tenantId}|${row.key}`,
    "Feature tenant+key",
    failures,
  );
  findDuplicateKeys(
    scopedRows(data.contentTypes),
    (row) => `${row.tenantId}|${row.slug}`,
    "ContentType tenant+slug",
    failures,
  );
  findDuplicateKeys(
    scopedRows(data.contentItems),
    (row) => `${row.tenantId}|${row.contentTypeSlug}|${row.slug}`,
    "ContentItem tenant+type+slug",
    failures,
  );
  findDuplicateKeys(
    scopedRows(data.taxonomies),
    (row) => `${row.tenantId}|${row.slug}`,
    "Taxonomy tenant+slug",
    failures,
  );
  findDuplicateKeys(
    scopedRows(data.taxonomyTerms),
    (row) => `${row.tenantId}|${row.taxonomyId}|${row.slug}`,
    "TaxonomyTerm tenant+taxonomy+slug",
    failures,
  );

  const normalizedUsers = data.users.map((user) => ({
    ...user,
    normalizedEmail: user.email.trim().toLowerCase(),
  }));
  findDuplicateKeys(
    normalizedUsers,
    (row) => row.normalizedEmail,
    "Global User email",
    failures,
  );
}

async function verifyTenantWorkspace(tenant, data, failures, summary) {
  const organization = data.organizations.find((row) => row.tenantId === tenant.id);
  if (!organization) {
    addFailure(failures, `Tenant ${tenant.key} has no Organization.`);
    return;
  }

  const users = data.users.filter((row) => row.tenantId === tenant.id);
  const memberships = data.organizationMemberships.filter(
    (row) => row.organizationId === organization.id,
  );
  const membershipByUser = new Map(memberships.map((row) => [row.userId, row]));
  const membershipById = new Map(memberships.map((row) => [row.id, row]));

  for (const membership of memberships) {
    tenantMismatch(
      failures,
      "OrganizationMembership",
      membership.id,
      tenant.id,
      membership.tenantId,
    );
  }

  for (const user of users) {
    const membership = membershipByUser.get(user.id);
    if (!membership) {
      addFailure(failures, `User ${user.id} has no membership in organization ${organization.id}.`);
      continue;
    }

    if (user.parentId) {
      const parentMembership = membershipByUser.get(user.parentId);
      if (!parentMembership || membership.parentMembershipId !== parentMembership.id) {
        addFailure(failures, `User ${user.id} membership parent does not match legacy parentId.`);
      }
    } else if (membership.parentMembershipId) {
      addFailure(failures, `User ${user.id} has unexpected membership parent ${membership.parentMembershipId}.`);
    }

    const expectedAncestors = user.ancestors.map((userId) => membershipByUser.get(userId)?.id);
    if (expectedAncestors.some((id) => !id)) {
      addFailure(failures, `User ${user.id} has an ancestor without an organization membership.`);
    } else if (expectedAncestors.join("|") !== membership.ancestors.join("|")) {
      addFailure(failures, `User ${user.id} membership ancestors do not match legacy hierarchy.`);
    }
  }

  for (const membership of memberships) {
    if (membership.parentMembershipId && !membershipById.has(membership.parentMembershipId)) {
      addFailure(failures, `OrganizationMembership ${membership.id} parent is outside organization.`);
    }
    for (const ancestorId of membership.ancestors) {
      if (!membershipById.has(ancestorId)) {
        addFailure(failures, `OrganizationMembership ${membership.id} ancestor ${ancestorId} is outside organization.`);
      }
    }
  }

  const externalByClerkSubject = new Map(
    data.externalIdentities
      .filter((row) => row.provider === "clerk")
      .map((row) => [row.subject, row]),
  );
  for (const user of users) {
    if (!user.clerkId) continue;
    const identity = externalByClerkSubject.get(user.clerkId);
    if (!identity || identity.userId !== user.id) {
      addFailure(failures, `User ${user.id} Clerk subject ${user.clerkId} is not migrated correctly.`);
    }
  }

  summary.targetTenant = {
    id: tenant.id,
    key: tenant.key,
    organizationId: organization.id,
    users: users.length,
    memberships: memberships.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { key: args.tenantKey } });
  if (!tenant) throw new Error(`Tenant ${args.tenantKey} does not exist.`);

  const failures = [];
  const summary = { scopedModels: [], targetTenant: null };

  await verifyNoMissingTenantIds(failures, summary);
  const data = await loadReferenceData();
  verifyRelations(data, failures);
  verifyFeatureAndTaxonomyKeys(data, failures);
  verifyFinalUniqueKeys(data, failures);
  await verifyTenantWorkspace(tenant, data, failures, summary);

  if (failures.length > 0) {
    console.error(
      JSON.stringify(
        {
          ready: false,
          tenantKey: tenant.key,
          failureCount: failures.length,
          failures,
          summary,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        ready: true,
        tenantKey: tenant.key,
        message:
          "Staged tenant data passed read-only cutover checks. Runtime scope must still remain on env until T-1301 proves two-tenant isolation.",
        summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
