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
const MAX_FAILURE_MESSAGES = 500;

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

The command performs no writes. It checks staged tenant assignments, declared
and soft references, workspace migration, external identities, and collisions
that would block final tenant-based indexes.

A clean result is NOT permission to switch runtime scoping. T-1301 must still
prove real two-tenant isolation before tenantId becomes authoritative.`);
}

function createFailureCollector() {
  return {
    total: 0,
    messages: [],
    add(message) {
      this.total += 1;
      if (this.messages.length < MAX_FAILURE_MESSAGES) {
        this.messages.push(message);
      }
    },
  };
}

function tenantMismatch(failures, label, rowId, expected, actual) {
  if (!actual || actual !== expected) {
    failures.add(
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
      failures.add(`${label} collision for ${key}: ${previous} and ${row.id}.`);
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
    summary.scopedModels.push({
      model: modelName,
      total,
      missingTenantId: missing,
    });
    if (missing > 0) {
      failures.add(`${modelName} has ${missing} row(s) without tenantId.`);
    }
  }
}

async function loadReferenceData() {
  const [
    admins,
    tenants,
    tenantDomains,
    users,
    sessions,
    invitations,
    activityLogs,
    products,
    prices,
    purchases,
    files,
    memberships,
    checkouts,
    features,
    siteSettings,
    pages,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
    media,
    blockTemplates,
    organizations,
    organizationMemberships,
    externalIdentities,
  ] = await Promise.all([
    prisma.admin.findMany({ select: { id: true } }),
    prisma.tenant.findMany({ select: { id: true, key: true } }),
    prisma.tenantDomain.findMany({
      select: { id: true, tenantId: true, host: true },
    }),
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
    prisma.userInvitation.findMany({
      select: { id: true, tenantId: true, invitedBy: true },
    }),
    prisma.activityLog.findMany({
      select: {
        id: true,
        tenantId: true,
        actor: true,
        actorId: true,
        resource: true,
        resourceId: true,
      },
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
        type: true,
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
    prisma.siteSetting.findMany({
      select: { id: true, tenantId: true, key: true },
    }),
    prisma.page.findMany({
      select: { id: true, tenantId: true, slug: true },
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
    prisma.media.findMany({ select: { id: true, tenantId: true } }),
    prisma.blockTemplate.findMany({
      select: { id: true, tenantId: true, slug: true },
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
    admins,
    tenants,
    tenantDomains,
    users,
    sessions,
    invitations,
    activityLogs,
    products,
    prices,
    purchases,
    files,
    memberships,
    checkouts,
    features,
    siteSettings,
    pages,
    contentTypes,
    contentItems,
    taxonomies,
    taxonomyTerms,
    media,
    blockTemplates,
    organizations,
    organizationMemberships,
    externalIdentities,
  };
}

function verifyFoundation(data, failures) {
  const tenants = new Map(data.tenants.map((row) => [row.id, row]));
  const users = new Map(data.users.map((row) => [row.id, row]));
  const organizations = new Map(data.organizations.map((row) => [row.id, row]));
  const memberships = new Map(
    data.organizationMemberships.map((row) => [row.id, row]),
  );

  for (const domain of data.tenantDomains) {
    if (!tenants.has(domain.tenantId)) {
      failures.add(
        `TenantDomain ${domain.id} (${domain.host}) references missing tenant ${domain.tenantId}.`,
      );
    }
  }

  for (const organization of data.organizations) {
    if (!tenants.has(organization.tenantId)) {
      failures.add(
        `Organization ${organization.id} references missing tenant ${organization.tenantId}.`,
      );
    }
  }

  for (const membership of data.organizationMemberships) {
    const organization = organizations.get(membership.organizationId);
    const user = users.get(membership.userId);

    if (!organization) {
      failures.add(
        `OrganizationMembership ${membership.id} references missing organization ${membership.organizationId}.`,
      );
    } else {
      tenantMismatch(
        failures,
        "OrganizationMembership/organization",
        membership.id,
        organization.tenantId,
        membership.tenantId,
      );
    }

    if (!user) {
      failures.add(
        `OrganizationMembership ${membership.id} references missing user ${membership.userId}.`,
      );
    } else {
      tenantMismatch(
        failures,
        "OrganizationMembership/user",
        membership.id,
        user.tenantId,
        membership.tenantId,
      );
    }

    if (membership.parentMembershipId) {
      const parent = memberships.get(membership.parentMembershipId);
      if (!parent || parent.organizationId !== membership.organizationId) {
        failures.add(
          `OrganizationMembership ${membership.id} has invalid parent ${membership.parentMembershipId}.`,
        );
      }
    }

    for (const ancestorId of membership.ancestors) {
      const ancestor = memberships.get(ancestorId);
      if (!ancestor || ancestor.organizationId !== membership.organizationId) {
        failures.add(
          `OrganizationMembership ${membership.id} has ancestor ${ancestorId} outside its organization.`,
        );
      }
    }
  }

  for (const identity of data.externalIdentities) {
    if (!users.has(identity.userId)) {
      failures.add(
        `ExternalIdentity ${identity.id} references missing user ${identity.userId}.`,
      );
    }
  }

  findDuplicateKeys(
    data.organizationMemberships,
    (row) => `${row.organizationId}|${row.userId}`,
    "OrganizationMembership organization+user",
    failures,
  );
  findDuplicateKeys(
    data.externalIdentities,
    (row) => `${row.provider}|${row.subject}`,
    "ExternalIdentity provider+subject",
    failures,
  );
}

function verifyLegacyAndScopedRelations(data, failures) {
  const admins = new Map(data.admins.map((row) => [row.id, row]));
  const users = new Map(data.users.map((row) => [row.id, row]));
  const products = new Map(data.products.map((row) => [row.id, row]));
  const prices = new Map(data.prices.map((row) => [row.id, row]));
  const purchases = new Map(data.purchases.map((row) => [row.id, row]));
  const memberships = new Map(data.memberships.map((row) => [row.id, row]));
  const features = new Map(data.features.map((row) => [row.id, row]));
  const siteSettings = new Map(data.siteSettings.map((row) => [row.id, row]));
  const pages = new Map(data.pages.map((row) => [row.id, row]));
  const contentTypes = new Map(data.contentTypes.map((row) => [row.id, row]));
  const contentItems = new Map(data.contentItems.map((row) => [row.id, row]));
  const taxonomies = new Map(data.taxonomies.map((row) => [row.id, row]));
  const taxonomyTerms = new Map(data.taxonomyTerms.map((row) => [row.id, row]));
  const media = new Map(data.media.map((row) => [row.id, row]));
  const blockTemplates = new Map(data.blockTemplates.map((row) => [row.id, row]));
  const files = new Map(data.files.map((row) => [row.id, row]));
  const checkouts = new Map(data.checkouts.map((row) => [row.id, row]));

  for (const user of data.users) {
    if (user.parentId) {
      const parent = users.get(user.parentId);
      if (!parent) {
        failures.add(`User ${user.id} references missing parent ${user.parentId}.`);
      } else {
        tenantMismatch(
          failures,
          "User parent",
          user.id,
          user.tenantId,
          parent.tenantId,
        );
      }
    }

    for (const ancestorId of user.ancestors) {
      const ancestor = users.get(ancestorId);
      if (!ancestor) {
        failures.add(`User ${user.id} references missing ancestor ${ancestorId}.`);
      } else {
        tenantMismatch(
          failures,
          "User ancestor",
          user.id,
          user.tenantId,
          ancestor.tenantId,
        );
      }
    }
  }

  for (const session of data.sessions) {
    const user = users.get(session.userId);
    if (!user) {
      failures.add(
        `UserSession ${session.id} references missing user ${session.userId}.`,
      );
      continue;
    }
    tenantMismatch(
      failures,
      "UserSession",
      session.id,
      user.tenantId,
      session.tenantId,
    );
  }

  for (const invitation of data.invitations) {
    if (!admins.has(invitation.invitedBy)) {
      failures.add(
        `UserInvitation ${invitation.id} references missing platform admin ${invitation.invitedBy}.`,
      );
    }
  }

  const resourceMaps = new Map([
    ["user", users],
    ["product", products],
    ["productPrice", prices],
    ["purchase", purchases],
    ["purchaseFile", files],
    ["membership", memberships],
    ["feature", features],
    ["siteSetting", siteSettings],
    ["checkoutSession", checkouts],
    ["page", pages],
    ["contentType", contentTypes],
    ["contentItem", contentItems],
    ["taxonomy", taxonomies],
    ["taxonomyTerm", taxonomyTerms],
    ["media", media],
    ["blockTemplate", blockTemplates],
  ]);

  for (const activity of data.activityLogs) {
    if (activity.actor === "user" && activity.actorId) {
      const actor = users.get(activity.actorId);
      if (!actor) {
        failures.add(
          `ActivityLog ${activity.id} references missing user actor ${activity.actorId}.`,
        );
      } else {
        tenantMismatch(
          failures,
          "ActivityLog/user actor",
          activity.id,
          actor.tenantId,
          activity.tenantId,
        );
      }
    }

    if (activity.actor === "admin" && activity.actorId && !admins.has(activity.actorId)) {
      failures.add(
        `ActivityLog ${activity.id} references missing platform admin ${activity.actorId}.`,
      );
    }

    if (activity.resource && activity.resourceId) {
      const resourceMap = resourceMaps.get(activity.resource);
      if (resourceMap) {
        const resource = resourceMap.get(activity.resourceId);
        if (!resource) {
          failures.add(
            `ActivityLog ${activity.id} references missing ${activity.resource} ${activity.resourceId}.`,
          );
        } else if ("tenantId" in resource) {
          tenantMismatch(
            failures,
            `ActivityLog/${activity.resource}`,
            activity.id,
            resource.tenantId,
            activity.tenantId,
          );
        }
      }
    }
  }

  for (const price of data.prices) {
    const product = products.get(price.productId);
    if (!product) {
      failures.add(
        `ProductPrice ${price.id} references missing product ${price.productId}.`,
      );
      continue;
    }
    tenantMismatch(
      failures,
      "ProductPrice",
      price.id,
      product.tenantId,
      price.tenantId,
    );
  }

  for (const purchase of data.purchases) {
    const user = users.get(purchase.userId);
    const product = products.get(purchase.productId);
    if (!user) {
      failures.add(
        `Purchase ${purchase.id} references missing user ${purchase.userId}.`,
      );
    }
    if (!product) {
      failures.add(
        `Purchase ${purchase.id} references missing product ${purchase.productId}.`,
      );
    }
    if (user) {
      tenantMismatch(
        failures,
        "Purchase/user",
        purchase.id,
        user.tenantId,
        purchase.tenantId,
      );
    }
    if (product) {
      tenantMismatch(
        failures,
        "Purchase/product",
        purchase.id,
        product.tenantId,
        purchase.tenantId,
      );
    }
  }

  for (const file of data.files) {
    const purchase = purchases.get(file.purchaseId);
    if (!purchase) {
      failures.add(
        `PurchaseFile ${file.id} references missing purchase ${file.purchaseId}.`,
      );
      continue;
    }
    tenantMismatch(
      failures,
      "PurchaseFile",
      file.id,
      purchase.tenantId,
      file.tenantId,
    );
  }

  for (const membership of data.memberships) {
    const user = users.get(membership.userId);
    if (!user) {
      failures.add(
        `Membership ${membership.id} references missing user ${membership.userId}.`,
      );
    } else {
      tenantMismatch(
        failures,
        "Membership/user",
        membership.id,
        user.tenantId,
        membership.tenantId,
      );
    }

    if (membership.type !== "purchase") {
      failures.add(
        `Membership ${membership.id} has unsupported source type ${membership.type}.`,
      );
      continue;
    }

    const purchase = purchases.get(membership.sourceId);
    if (!purchase) {
      failures.add(
        `Membership ${membership.id} references missing purchase ${membership.sourceId}.`,
      );
    } else {
      tenantMismatch(
        failures,
        "Membership/source",
        membership.id,
        purchase.tenantId,
        membership.tenantId,
      );
    }
  }

  for (const checkout of data.checkouts) {
    if (checkout.userId) {
      const user = users.get(checkout.userId);
      if (!user) {
        failures.add(
          `CheckoutSession ${checkout.id} references missing user ${checkout.userId}.`,
        );
      } else {
        tenantMismatch(
          failures,
          "CheckoutSession/user",
          checkout.id,
          user.tenantId,
          checkout.tenantId,
        );
      }
    }

    if (!Array.isArray(checkout.items)) {
      failures.add(`CheckoutSession ${checkout.id} items is not an array.`);
      continue;
    }

    for (const [index, value] of checkout.items.entries()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        failures.add(`CheckoutSession ${checkout.id} item ${index} is invalid.`);
        continue;
      }

      const productId = typeof value.productId === "string" ? value.productId : null;
      if (!productId) {
        failures.add(
          `CheckoutSession ${checkout.id} item ${index} has invalid productId.`,
        );
        continue;
      }

      const product = products.get(productId);
      if (!product) {
        failures.add(
          `CheckoutSession ${checkout.id} item ${index} references missing product ${productId}.`,
        );
        continue;
      }
      tenantMismatch(
        failures,
        "CheckoutSession/product",
        checkout.id,
        product.tenantId,
        checkout.tenantId,
      );

      const priceId = typeof value.priceId === "string" ? value.priceId : null;
      if (!priceId) continue;

      const price = prices.get(priceId);
      if (!price) {
        failures.add(
          `CheckoutSession ${checkout.id} item ${index} references missing price ${priceId}.`,
        );
        continue;
      }
      if (price.productId !== productId) {
        failures.add(
          `CheckoutSession ${checkout.id} item ${index} price ${priceId} belongs to product ${price.productId}, not ${productId}.`,
        );
      }
      tenantMismatch(
        failures,
        "CheckoutSession/price",
        checkout.id,
        price.tenantId,
        checkout.tenantId,
      );
    }
  }

  for (const item of data.contentItems) {
    const contentType = contentTypes.get(item.contentTypeId);
    if (!contentType) {
      failures.add(
        `ContentItem ${item.id} references missing content type ${item.contentTypeId}.`,
      );
      continue;
    }
    tenantMismatch(
      failures,
      "ContentItem",
      item.id,
      contentType.tenantId,
      item.tenantId,
    );
    if (item.contentTypeSlug !== contentType.slug) {
      failures.add(
        `ContentItem ${item.id} contentTypeSlug ${item.contentTypeSlug} does not match ${contentType.slug}.`,
      );
    }
  }

  for (const term of data.taxonomyTerms) {
    const taxonomy = taxonomies.get(term.taxonomyId);
    if (!taxonomy) {
      failures.add(
        `TaxonomyTerm ${term.id} references missing taxonomy ${term.taxonomyId}.`,
      );
      continue;
    }
    tenantMismatch(
      failures,
      "TaxonomyTerm",
      term.id,
      taxonomy.tenantId,
      term.tenantId,
    );

    if (term.parentId) {
      const parent = taxonomyTerms.get(term.parentId);
      if (!parent || parent.taxonomyId !== term.taxonomyId) {
        failures.add(
          `TaxonomyTerm ${term.id} has invalid parent ${term.parentId}.`,
        );
      } else {
        tenantMismatch(
          failures,
          "TaxonomyTerm parent",
          term.id,
          term.tenantId,
          parent.tenantId,
        );
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
        failures.add(
          `Product ${product.id} access key ${key} is missing in tenant ${product.tenantId}.`,
        );
      }
    }
  }

  for (const membership of data.memberships) {
    const keys = featureKeysByTenant.get(membership.tenantId) ?? new Set();
    for (const key of membership.featureKeys) {
      if (!keys.has(key)) {
        failures.add(
          `Membership ${membership.id} feature key ${key} is missing in tenant ${membership.tenantId}.`,
        );
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
        failures.add(
          `Taxonomy ${taxonomy.id} content type ${contentTypeSlug} is missing in tenant ${taxonomy.tenantId}.`,
        );
      }
    }
  }
}

function verifyFinalUniqueKeys(data, failures) {
  const scopedRows = (rows) => rows.filter((row) => row.tenantId);

  const checks = [
    [data.products, (row) => `${row.tenantId}|${row.slug}`, "Product tenant+slug"],
    [data.features, (row) => `${row.tenantId}|${row.key}`, "Feature tenant+key"],
    [data.siteSettings, (row) => `${row.tenantId}|${row.key}`, "SiteSetting tenant+key"],
    [data.pages, (row) => `${row.tenantId}|${row.slug}`, "Page tenant+slug"],
    [data.contentTypes, (row) => `${row.tenantId}|${row.slug}`, "ContentType tenant+slug"],
    [
      data.contentItems,
      (row) => `${row.tenantId}|${row.contentTypeSlug}|${row.slug}`,
      "ContentItem tenant+type+slug",
    ],
    [data.taxonomies, (row) => `${row.tenantId}|${row.slug}`, "Taxonomy tenant+slug"],
    [
      data.taxonomyTerms,
      (row) => `${row.tenantId}|${row.taxonomyId}|${row.slug}`,
      "TaxonomyTerm tenant+taxonomy+slug",
    ],
    [
      data.blockTemplates,
      (row) => `${row.tenantId}|${row.slug}`,
      "BlockTemplate tenant+slug",
    ],
  ];

  for (const [rows, keyForRow, label] of checks) {
    findDuplicateKeys(scopedRows(rows), keyForRow, label, failures);
  }

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

function verifyWorkspaceMigration(targetTenant, data, failures, summary) {
  const organizationsByTenant = new Map();
  for (const organization of data.organizations) {
    const list = organizationsByTenant.get(organization.tenantId) ?? [];
    list.push(organization);
    organizationsByTenant.set(organization.tenantId, list);
  }

  const membershipsByOrganization = new Map();
  for (const membership of data.organizationMemberships) {
    const list = membershipsByOrganization.get(membership.organizationId) ?? [];
    list.push(membership);
    membershipsByOrganization.set(membership.organizationId, list);
  }

  const externalByClerkSubject = new Map(
    data.externalIdentities
      .filter((row) => row.provider === "clerk")
      .map((row) => [row.subject, row]),
  );

  for (const tenant of data.tenants) {
    const organizations = organizationsByTenant.get(tenant.id) ?? [];
    if (organizations.length !== 1) {
      failures.add(
        `Tenant ${tenant.key} has ${organizations.length} organizations; expected exactly one.`,
      );
      continue;
    }

    const organization = organizations[0];
    const users = data.users.filter((row) => row.tenantId === tenant.id);
    const memberships = membershipsByOrganization.get(organization.id) ?? [];
    const membershipByUser = new Map(memberships.map((row) => [row.userId, row]));
    const membershipById = new Map(memberships.map((row) => [row.id, row]));

    for (const user of users) {
      const membership = membershipByUser.get(user.id);
      if (!membership) {
        failures.add(
          `User ${user.id} has no membership in organization ${organization.id}.`,
        );
        continue;
      }

      if (user.parentId) {
        const parentMembership = membershipByUser.get(user.parentId);
        if (!parentMembership || membership.parentMembershipId !== parentMembership.id) {
          failures.add(
            `User ${user.id} membership parent does not match legacy parentId.`,
          );
        }
      } else if (membership.parentMembershipId) {
        failures.add(
          `User ${user.id} has unexpected membership parent ${membership.parentMembershipId}.`,
        );
      }

      const expectedAncestors = user.ancestors.map(
        (userId) => membershipByUser.get(userId)?.id,
      );
      if (expectedAncestors.some((id) => !id)) {
        failures.add(
          `User ${user.id} has an ancestor without an organization membership.`,
        );
      } else if (expectedAncestors.join("|") !== membership.ancestors.join("|")) {
        failures.add(
          `User ${user.id} membership ancestors do not match legacy hierarchy.`,
        );
      }

      if (user.clerkId) {
        const identity = externalByClerkSubject.get(user.clerkId);
        if (!identity || identity.userId !== user.id) {
          failures.add(
            `User ${user.id} Clerk subject ${user.clerkId} is not migrated correctly.`,
          );
        }
      }
    }

    for (const membership of memberships) {
      if (membership.parentMembershipId && !membershipById.has(membership.parentMembershipId)) {
        failures.add(
          `OrganizationMembership ${membership.id} parent is outside organization ${organization.id}.`,
        );
      }
      for (const ancestorId of membership.ancestors) {
        if (!membershipById.has(ancestorId)) {
          failures.add(
            `OrganizationMembership ${membership.id} ancestor ${ancestorId} is outside organization ${organization.id}.`,
          );
        }
      }
    }

    if (tenant.id === targetTenant.id) {
      summary.targetTenant = {
        id: tenant.id,
        key: tenant.key,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        users: users.length,
        memberships: memberships.length,
      };
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const failures = createFailureCollector();
  const summary = {
    scopedModels: [],
    tenantCount: 0,
    organizationCount: 0,
    organizationMembershipCount: 0,
    externalIdentityCount: 0,
    targetTenant: null,
  };

  await verifyNoMissingTenantIds(failures, summary);
  const data = await loadReferenceData();
  const tenant = data.tenants.find((row) => row.key === args.tenantKey);
  if (!tenant) throw new Error(`Tenant ${args.tenantKey} does not exist.`);

  summary.tenantCount = data.tenants.length;
  summary.organizationCount = data.organizations.length;
  summary.organizationMembershipCount = data.organizationMemberships.length;
  summary.externalIdentityCount = data.externalIdentities.length;

  verifyFoundation(data, failures);
  verifyLegacyAndScopedRelations(data, failures);
  verifyFeatureAndTaxonomyKeys(data, failures);
  verifyFinalUniqueKeys(data, failures);
  verifyWorkspaceMigration(tenant, data, failures, summary);

  if (failures.total > 0) {
    console.error(
      JSON.stringify(
        {
          ready: false,
          tenantKey: tenant.key,
          failureCount: failures.total,
          failures: failures.messages,
          failuresTruncated: failures.total > failures.messages.length,
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
          "Staged tenant data passed read-only cutover checks. Runtime scope must remain on env until T-1301 proves real two-tenant isolation and the tenant guard cutover is reviewed separately.",
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
