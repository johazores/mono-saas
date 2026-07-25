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
  const values = new Map();
  let apply = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }
    values.set(arg.slice(2), value.trim());
    index += 1;
  }

  return { values, apply, help };
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function parseOptions(argv) {
  const { values, apply, help } = parseArgs(argv);
  if (help) return { help: true };

  const sourceEnv = required(values, "source-env");
  if (!["dev", "production"].includes(sourceEnv)) {
    throw new Error("--source-env must be dev or production.");
  }

  const tenantKey = required(values, "tenant-key").toLowerCase();
  const organizationSlug = required(values, "organization-slug").toLowerCase();
  if (!KEY_PATTERN.test(tenantKey)) {
    throw new Error("--tenant-key must be lowercase alphanumeric with hyphens.");
  }
  if (!KEY_PATTERN.test(organizationSlug)) {
    throw new Error(
      "--organization-slug must be lowercase alphanumeric with hyphens.",
    );
  }

  return {
    help: false,
    apply,
    sourceEnv,
    tenantKey,
    tenantName: required(values, "tenant-name"),
    organizationSlug,
    organizationName: required(values, "organization-name"),
  };
}

function printHelp() {
  console.log(`Tenant scope backfill (dry-run by default)

Usage:
  node scripts/backfill-tenant-scope.mjs \\
    --source-env dev \\
    --tenant-key default \\
    --tenant-name "Default Tenant" \\
    --organization-slug default \\
    --organization-name "Default Organization" \\
    [--apply]

The command never removes legacy env fields. Without --apply it performs only
preflight validation/counts. Re-running with the same mapping is supported.`);
}

function failConflicts(conflicts) {
  if (conflicts.length === 0) return;
  const preview = conflicts.slice(0, 50).map((item) => `- ${item}`).join("\n");
  const suffix = conflicts.length > 50
    ? `\n- ... ${conflicts.length - 50} more conflict(s)`
    : "";
  throw new Error(`Tenant backfill validation failed:\n${preview}${suffix}`);
}

async function resolveDestination(options) {
  let tenant = await prisma.tenant.findUnique({
    where: { key: options.tenantKey },
  });

  if (!tenant && options.apply) {
    tenant = await prisma.tenant.create({
      data: {
        key: options.tenantKey,
        name: options.tenantName,
        status: "active",
      },
    });
  }

  let organization = null;
  if (tenant) {
    organization = await prisma.organization.findUnique({
      where: { tenantId: tenant.id },
    });

    if (organization && organization.slug !== options.organizationSlug) {
      throw new Error(
        `Tenant ${tenant.key} already belongs to organization slug ${organization.slug}, not ${options.organizationSlug}.`,
      );
    }

    if (!organization && options.apply) {
      organization = await prisma.organization.create({
        data: {
          tenantId: tenant.id,
          name: options.organizationName,
          slug: options.organizationSlug,
          status: "active",
        },
      });
    }
  }

  return { tenant, organization };
}

async function scopedModelPlan(sourceEnv, destinationTenantId) {
  const plan = [];
  const conflicts = [];

  for (const [modelName, delegateName] of LEGACY_SCOPED_DELEGATES) {
    const delegate = prisma[delegateName];
    const total = await delegate.count({ where: { env: sourceEnv } });
    const missing = await delegate.count({
      where: { env: sourceEnv, tenantId: null },
    });
    const assignedRows = await delegate.findMany({
      where: { env: sourceEnv, tenantId: { not: null } },
      select: { id: true, tenantId: true },
    });

    const unexpectedAssignments = destinationTenantId
      ? assignedRows.filter((row) => row.tenantId !== destinationTenantId)
      : assignedRows;

    for (const row of unexpectedAssignments.slice(0, 10)) {
      conflicts.push(
        `${modelName} ${row.id} is already assigned to tenant ${row.tenantId}.`,
      );
    }
    if (unexpectedAssignments.length > 10) {
      conflicts.push(
        `${modelName} has ${unexpectedAssignments.length - 10} additional conflicting tenant assignment(s).`,
      );
    }

    plan.push({
      modelName,
      delegateName,
      total,
      missing,
      alreadyAssigned: assignedRows.length,
    });
  }

  return { plan, conflicts };
}

async function loadLegacyReferenceData(sourceEnv) {
  const [
    users,
    userSessions,
    products,
    productPrices,
    purchases,
    purchaseFiles,
    memberships,
    checkoutSessions,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { env: sourceEnv },
      select: {
        id: true,
        email: true,
        status: true,
        parentId: true,
        ancestors: true,
        clerkId: true,
      },
    }),
    prisma.userSession.findMany({
      where: { env: sourceEnv },
      select: { id: true, userId: true },
    }),
    prisma.product.findMany({
      where: { env: sourceEnv },
      select: { id: true },
    }),
    prisma.productPrice.findMany({
      where: { env: sourceEnv },
      select: { id: true, productId: true },
    }),
    prisma.purchase.findMany({
      where: { env: sourceEnv },
      select: { id: true, userId: true, productId: true },
    }),
    prisma.purchaseFile.findMany({
      where: { env: sourceEnv },
      select: { id: true, purchaseId: true },
    }),
    prisma.membership.findMany({
      where: { env: sourceEnv },
      select: { id: true, userId: true, sourceId: true },
    }),
    prisma.checkoutSession.findMany({
      where: { env: sourceEnv },
      select: { id: true, userId: true, items: true },
    }),
    prisma.contentType.findMany({
      where: { env: sourceEnv },
      select: { id: true },
    }),
    prisma.contentItem.findMany({
      where: { env: sourceEnv },
      select: { id: true, contentTypeId: true },
    }),
    prisma.taxonomy.findMany({
      where: { env: sourceEnv },
      select: { id: true },
    }),
    prisma.taxonomyTerm.findMany({
      where: { env: sourceEnv },
      select: { id: true, taxonomyId: true, parentId: true },
    }),
  ]);

  return {
    users,
    userSessions,
    products,
    productPrices,
    purchases,
    purchaseFiles,
    memberships,
    checkoutSessions,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
  };
}

function validateLegacyReferences(data) {
  const conflicts = [];
  const userIds = new Set(data.users.map((row) => row.id));
  const productIds = new Set(data.products.map((row) => row.id));
  const priceIds = new Set(data.productPrices.map((row) => row.id));
  const purchaseIds = new Set(data.purchases.map((row) => row.id));
  const contentTypeIds = new Set(data.contentTypes.map((row) => row.id));
  const taxonomyIds = new Set(data.taxonomies.map((row) => row.id));
  const taxonomyTerms = new Map(
    data.taxonomyTerms.map((row) => [row.id, row]),
  );

  for (const user of data.users) {
    if (user.parentId && !userIds.has(user.parentId)) {
      conflicts.push(`User ${user.id} parentId points outside source env.`);
    }
    for (const ancestorId of user.ancestors) {
      if (!userIds.has(ancestorId)) {
        conflicts.push(`User ${user.id} ancestor ${ancestorId} points outside source env.`);
      }
    }
  }

  for (const session of data.userSessions) {
    if (!userIds.has(session.userId)) {
      conflicts.push(`UserSession ${session.id} userId points outside source env.`);
    }
  }

  for (const price of data.productPrices) {
    if (!productIds.has(price.productId)) {
      conflicts.push(`ProductPrice ${price.id} productId points outside source env.`);
    }
  }

  for (const purchase of data.purchases) {
    if (!userIds.has(purchase.userId)) {
      conflicts.push(`Purchase ${purchase.id} userId points outside source env.`);
    }
    if (!productIds.has(purchase.productId)) {
      conflicts.push(`Purchase ${purchase.id} productId points outside source env.`);
    }
  }

  for (const file of data.purchaseFiles) {
    if (!purchaseIds.has(file.purchaseId)) {
      conflicts.push(`PurchaseFile ${file.id} purchaseId points outside source env.`);
    }
  }

  for (const membership of data.memberships) {
    if (!userIds.has(membership.userId)) {
      conflicts.push(`Membership ${membership.id} userId points outside source env.`);
    }
    if (!purchaseIds.has(membership.sourceId)) {
      conflicts.push(`Membership ${membership.id} sourceId points outside source env.`);
    }
  }

  for (const checkout of data.checkoutSessions) {
    if (checkout.userId && !userIds.has(checkout.userId)) {
      conflicts.push(`CheckoutSession ${checkout.id} userId points outside source env.`);
    }

    if (!Array.isArray(checkout.items)) {
      conflicts.push(`CheckoutSession ${checkout.id} items is not an array.`);
      continue;
    }

    for (const [index, item] of checkout.items.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        conflicts.push(`CheckoutSession ${checkout.id} item ${index} is invalid.`);
        continue;
      }
      const productId = typeof item.productId === "string" ? item.productId : null;
      const priceId = typeof item.priceId === "string" ? item.priceId : null;
      if (!productId || !productIds.has(productId)) {
        conflicts.push(
          `CheckoutSession ${checkout.id} item ${index} productId is outside source env.`,
        );
      }
      if (priceId && !priceIds.has(priceId)) {
        conflicts.push(
          `CheckoutSession ${checkout.id} item ${index} priceId is outside source env.`,
        );
      }
    }
  }

  for (const item of data.contentItems) {
    if (!contentTypeIds.has(item.contentTypeId)) {
      conflicts.push(`ContentItem ${item.id} contentTypeId points outside source env.`);
    }
  }

  for (const term of data.taxonomyTerms) {
    if (!taxonomyIds.has(term.taxonomyId)) {
      conflicts.push(`TaxonomyTerm ${term.id} taxonomyId points outside source env.`);
    }
    if (term.parentId) {
      const parent = taxonomyTerms.get(term.parentId);
      if (!parent || parent.taxonomyId !== term.taxonomyId) {
        conflicts.push(
          `TaxonomyTerm ${term.id} parentId points outside its source taxonomy.`,
        );
      }
    }
  }

  return conflicts;
}

async function applyScopedTenantIds(plan, sourceEnv, tenantId) {
  const results = [];
  for (const item of plan) {
    const delegate = prisma[item.delegateName];
    const result = await delegate.updateMany({
      where: { env: sourceEnv, tenantId: null },
      data: { tenantId },
    });
    results.push({ model: item.modelName, updated: result.count });
  }
  return results;
}

async function migrateOrganizationMemberships(users, tenant, organization, apply) {
  if (!apply) {
    return {
      expectedMemberships: users.length,
      clerkIdentities: users.filter((user) => user.clerkId).length,
    };
  }

  for (const user of users) {
    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      create: {
        tenantId: tenant.id,
        organizationId: organization.id,
        userId: user.id,
        ancestors: [],
        status: user.status === "active" ? "active" : "disabled",
      },
      update: {
        tenantId: tenant.id,
        status: user.status === "active" ? "active" : "disabled",
      },
    });
  }

  const persistedMemberships = await prisma.organizationMembership.findMany({
    where: { organizationId: organization.id },
    select: { id: true, userId: true },
  });
  const membershipByUserId = new Map(
    persistedMemberships.map((membership) => [membership.userId, membership.id]),
  );

  for (const user of users) {
    const membershipId = membershipByUserId.get(user.id);
    if (!membershipId) {
      throw new Error(`Missing OrganizationMembership for user ${user.id}.`);
    }

    const parentMembershipId = user.parentId
      ? membershipByUserId.get(user.parentId)
      : null;
    const ancestors = user.ancestors.map((userId) => {
      const ancestorMembershipId = membershipByUserId.get(userId);
      if (!ancestorMembershipId) {
        throw new Error(
          `Missing OrganizationMembership for ancestor user ${userId}.`,
        );
      }
      return ancestorMembershipId;
    });

    await prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        parentMembershipId: parentMembershipId ?? null,
        ancestors,
      },
    });
  }

  let clerkIdentities = 0;
  for (const user of users) {
    if (!user.clerkId) continue;
    clerkIdentities += 1;

    const existing = await prisma.externalIdentity.findUnique({
      where: {
        provider_subject: {
          provider: "clerk",
          subject: user.clerkId,
        },
      },
    });

    if (existing && existing.userId !== user.id) {
      throw new Error(
        `Clerk subject ${user.clerkId} is already linked to user ${existing.userId}.`,
      );
    }

    await prisma.externalIdentity.upsert({
      where: {
        provider_subject: {
          provider: "clerk",
          subject: user.clerkId,
        },
      },
      create: {
        userId: user.id,
        provider: "clerk",
        subject: user.clerkId,
        email: user.email,
      },
      update: {
        userId: user.id,
        email: user.email,
      },
    });
  }

  return {
    expectedMemberships: users.length,
    clerkIdentities,
  };
}

async function verifyAppliedScope(sourceEnv, tenantId, organizationId, userCount) {
  const failures = [];

  for (const [modelName, delegateName] of LEGACY_SCOPED_DELEGATES) {
    const delegate = prisma[delegateName];
    const missing = await delegate.count({
      where: { env: sourceEnv, tenantId: null },
    });
    const wrongRows = await delegate.findMany({
      where: { env: sourceEnv, tenantId: { not: null } },
      select: { id: true, tenantId: true },
    });
    const wrong = wrongRows.filter((row) => row.tenantId !== tenantId);
    if (missing > 0) failures.push(`${modelName} has ${missing} row(s) without tenantId.`);
    if (wrong.length > 0) {
      failures.push(`${modelName} has ${wrong.length} row(s) assigned to another tenant.`);
    }
  }

  const membershipCount = await prisma.organizationMembership.count({
    where: { organizationId },
  });
  if (membershipCount !== userCount) {
    failures.push(
      `Organization has ${membershipCount} membership(s); expected ${userCount}.`,
    );
  }

  failConflicts(failures);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        sourceEnv: options.sourceEnv,
        tenantKey: options.tenantKey,
        organizationSlug: options.organizationSlug,
      },
      null,
      2,
    ),
  );

  const destination = await resolveDestination(options);
  const { plan, conflicts: assignmentConflicts } = await scopedModelPlan(
    options.sourceEnv,
    destination.tenant?.id ?? null,
  );
  const referenceData = await loadLegacyReferenceData(options.sourceEnv);
  const referenceConflicts = validateLegacyReferences(referenceData);
  failConflicts([...assignmentConflicts, ...referenceConflicts]);

  console.table(
    plan.map((item) => ({
      model: item.modelName,
      sourceRows: item.total,
      missingTenantId: item.missing,
      alreadyAssigned: item.alreadyAssigned,
    })),
  );

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          tenantExists: Boolean(destination.tenant),
          organizationExists: Boolean(destination.organization),
          users: referenceData.users.length,
          clerkIdentities: referenceData.users.filter((user) => user.clerkId).length,
          message: "Preflight passed. Re-run with --apply to write changes.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const { tenant, organization } = destination;
  if (!tenant || !organization) {
    throw new Error("Destination tenant/organization could not be resolved.");
  }

  const scopeUpdates = await applyScopedTenantIds(
    plan,
    options.sourceEnv,
    tenant.id,
  );
  const membershipResult = await migrateOrganizationMemberships(
    referenceData.users,
    tenant,
    organization,
    true,
  );

  await verifyAppliedScope(
    options.sourceEnv,
    tenant.id,
    organization.id,
    referenceData.users.length,
  );

  console.log(
    JSON.stringify(
      {
        applied: true,
        tenantId: tenant.id,
        organizationId: organization.id,
        scopeUpdates,
        ...membershipResult,
        message:
          "Backfill verified. Legacy env fields remain active until the tenant-scope runtime cutover.",
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
