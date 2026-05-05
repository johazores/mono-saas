import { prisma } from "../lib/prisma";
import { basePrisma } from "../lib/base-prisma";
import { hashPassword } from "../lib/password";
import { getAppEnvSync } from "../lib/env";
import { getUserSessionSecret } from "../lib/secure-credentials";

async function main() {
  const env = getAppEnvSync();
  console.log(`Seeding for environment: ${env}\n`);

  // Seed SystemConfig default (global, not env-scoped)
  await basePrisma.systemConfig.upsert({
    where: { key: "APP_ENV" },
    update: {},
    create: { key: "APP_ENV", value: env },
  });
  console.log(`SystemConfig APP_ENV seeded: ${env}`);

  // Seed products (includes subscription plans and one-time purchases)
  const products = [
    {
      name: "Free",
      slug: "free",
      description: "Basic access with limited features",
      type: "membership" as const,
      price: 0,
      currency: "USD",
      paymentModel: "recurring" as const,
      maxSubUsers: 0,
      accessKeys: ["storage.1gb", "support.community"],
      sortOrder: 0,
    },
    {
      name: "Starter",
      slug: "starter",
      description: "For individuals getting started",
      type: "membership" as const,
      price: 9.99,
      currency: "USD",
      paymentModel: "recurring" as const,
      maxSubUsers: 3,
      accessKeys: ["storage.5gb", "support.email", "sub-users.create"],
      sortOrder: 1,
    },
    {
      name: "Pro",
      slug: "pro",
      description: "For professionals and small teams",
      type: "membership" as const,
      price: 29.99,
      currency: "USD",
      paymentModel: "recurring" as const,
      maxSubUsers: 10,
      accessKeys: [
        "storage.50gb",
        "support.priority",
        "api.access",
        "sub-users.create",
        "reports.advanced",
        "products.digital-downloads",
      ],
      sortOrder: 2,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      description: "For large organizations with custom needs",
      type: "membership" as const,
      price: 99.99,
      currency: "USD",
      paymentModel: "recurring" as const,
      maxSubUsers: -1,
      accessKeys: [
        "storage.unlimited",
        "support.dedicated",
        "api.access",
        "sub-users.create",
        "reports.advanced",
        "integrations.custom",
        "products.digital-downloads",
      ],
      sortOrder: 3,
    },
    {
      name: "SEO Report",
      slug: "seo-report",
      description: "Comprehensive SEO analysis report",
      type: "digital" as const,
      price: 49.99,
      currency: "USD",
      paymentModel: "one-time" as const,
      accessKeys: ["reports.advanced"],
      sortOrder: 10,
    },
    {
      name: "API Access Pass",
      slug: "api-access-pass",
      description: "Lifetime API access",
      type: "digital" as const,
      price: 199.99,
      currency: "USD",
      paymentModel: "one-time" as const,
      accessKeys: ["api.access"],
      sortOrder: 11,
    },
    {
      name: "Premium Membership",
      slug: "premium-membership",
      description: "Premium membership with all features",
      type: "membership" as const,
      price: 19.99,
      currency: "USD",
      paymentModel: "recurring" as const,
      accessKeys: [
        "reports.advanced",
        "api.access",
        "products.digital-downloads",
      ],
      sortOrder: 12,
    },
  ];

  const seededProducts: Record<string, string> = {};
  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { env_slug: { env, slug: product.slug } },
      update: {
        name: product.name,
        description: product.description,
        type: product.type,
        price: product.price,
        currency: product.currency,
        paymentModel: product.paymentModel,
        accessKeys: product.accessKeys,
        maxSubUsers: product.maxSubUsers ?? 0,
        sortOrder: product.sortOrder,
      },
      create: product,
    });
    seededProducts[product.slug] = created.id;
    console.log("Product seeded:", product.name);
  }

  // Seed features
  const features = [
    {
      key: "storage.1gb",
      description: "1 GB storage",
      category: "storage",
      sortOrder: 0,
    },
    {
      key: "storage.5gb",
      description: "5 GB storage",
      category: "storage",
      sortOrder: 1,
    },
    {
      key: "storage.50gb",
      description: "50 GB storage",
      category: "storage",
      sortOrder: 2,
    },
    {
      key: "storage.unlimited",
      description: "Unlimited storage",
      category: "storage",
      sortOrder: 3,
    },
    {
      key: "support.community",
      description: "Community support",
      category: "support",
      sortOrder: 0,
    },
    {
      key: "support.email",
      description: "Email support",
      category: "support",
      sortOrder: 1,
    },
    {
      key: "support.priority",
      description: "Priority support",
      category: "support",
      sortOrder: 2,
    },
    {
      key: "support.dedicated",
      description: "Dedicated support",
      category: "support",
      sortOrder: 3,
    },
    {
      key: "api.access",
      description: "API access",
      category: "features",
      sortOrder: 0,
    },
    {
      key: "sub-users.create",
      description: "Create sub-users",
      category: "features",
      sortOrder: 1,
    },
    {
      key: "reports.advanced",
      description: "Advanced reports",
      category: "features",
      sortOrder: 2,
    },
    {
      key: "integrations.custom",
      description: "Custom integrations",
      category: "features",
      sortOrder: 3,
    },
    {
      key: "products.digital-downloads",
      description: "Access digital downloads",
      category: "features",
      sortOrder: 4,
    },
  ];

  for (const feature of features) {
    await prisma.feature.upsert({
      where: { env_key: { env, key: feature.key } },
      update: {
        description: feature.description,
        category: feature.category,
        sortOrder: feature.sortOrder,
      },
      create: feature,
    });
  }
  console.log(`Features seeded: ${features.length} definitions`);

  // Seed admin
  const adminHash = hashPassword("ChangeMe123!");
  const admin = await prisma.admin.upsert({
    where: { email: "admin@admin.com" },
    update: { passwordHash: adminHash },
    create: {
      name: "Admin",
      email: "admin@admin.com",
      passwordHash: adminHash,
      role: "admin",
      status: "active",
    },
  });
  console.log("Admin seeded:", admin.email);

  // Seed user
  const userHash = hashPassword("ChangeMe123!");
  const user = await prisma.user.upsert({
    where: { env_email: { env, email: "user@demo.com" } },
    update: { passwordHash: userHash },
    create: {
      name: "Demo User",
      email: "user@demo.com",
      passwordHash: userHash,
      status: "active",
      phone: "+1-555-0100",
      address: {
        street: "123 Main St",
        city: "Portland",
        state: "OR",
        zip: "97201",
        country: "US",
      },
    },
  });
  console.log("User seeded:", user.email);

  // Assign starter subscription to demo user (cancel existing first)
  await prisma.purchase.updateMany({
    where: {
      userId: user.id,
      status: "active",
      product: { paymentModel: "recurring" },
    },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  const purchase = await prisma.purchase.create({
    data: {
      userId: user.id,
      productId: seededProducts["starter"],
      amount: 9.99,
      currency: "USD",
      status: "active",
    },
  });
  console.log("Subscription assigned: Demo User -> Starter");

  // Grant membership from subscription so feature checks work
  const starterProduct = products.find((p) => p.slug === "starter")!;
  await prisma.membership.deleteMany({
    where: { userId: user.id, type: "purchase" },
  });
  await prisma.membership.create({
    data: {
      userId: user.id,
      type: "purchase",
      sourceId: purchase.id,
      featureKeys: starterProduct.accessKeys,
      status: "active",
    },
  });
  console.log("Membership granted: Demo User -> Starter features");

  // Seed a sub-user under the demo user to exercise the hierarchy system
  const subUserHash = hashPassword("ChangeMe123!");
  const subUser = await prisma.user.upsert({
    where: { env_email: { env, email: "sub@demo.com" } },
    update: {
      passwordHash: subUserHash,
      parentId: user.id,
      ancestors: [user.id],
    },
    create: {
      name: "Demo Sub-User",
      email: "sub@demo.com",
      passwordHash: subUserHash,
      status: "active",
      parentId: user.id,
      ancestors: [user.id],
    },
  });
  console.log("Sub-user seeded:", subUser.email);

  // Sub-users inherit their parent's plan dynamically at runtime —
  // no purchase or membership needs to be created here.

  // Seed default site settings
  const defaultSettings = [
    { key: "auth.provider", value: "credentials" },
    { key: "auth.clerkPublishableKey", value: "" },
    { key: "auth.clerkSecretKey", value: "" },
    { key: "payment.provider", value: "stripe" },
    { key: "payment.mode", value: "test" },
    { key: "payment.stripe.testPublicKey", value: "" },
    { key: "payment.stripe.testSecretKey", value: "" },
    { key: "payment.stripe.livePublicKey", value: "" },
    { key: "payment.stripe.liveSecretKey", value: "" },
    // Site identity
    { key: "site.title", value: "mono-next" },
    {
      key: "site.tagline",
      value: "Full-stack monorepo with admin panel, user dashboard, and API.",
    },
    { key: "site.favicon", value: "" },
    { key: "site.logo", value: "" },
    { key: "site.logoDark", value: "" },
    // Theme tokens (defaults match Tailwind blue-600 palette)
    { key: "theme.primary", value: "#2563eb" },
    { key: "theme.primaryHover", value: "#1d4ed8" },
    { key: "theme.secondary", value: "#4b5563" },
    { key: "theme.secondaryHover", value: "#374151" },
    { key: "theme.accent", value: "#7c3aed" },
    { key: "theme.background", value: "#ffffff" },
    { key: "theme.surface", value: "#f9fafb" },
    { key: "theme.border", value: "#e5e7eb" },
    { key: "theme.text", value: "#111827" },
    { key: "theme.textMuted", value: "#6b7280" },
    { key: "theme.success", value: "#16a34a" },
    { key: "theme.error", value: "#dc2626" },
    { key: "theme.warning", value: "#d97706" },
    { key: "theme.info", value: "#2563eb" },
  ];
  for (const setting of defaultSettings) {
    await prisma.siteSetting.upsert({
      where: { env_key: { env, key: setting.key } },
      update: {},
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log("Default site settings seeded");

  // Seed product prices (multiple prices per product with date ranges)
  const pricesToSeed = [
    // Free plan — $0 test price
    {
      productSlug: "free",
      label: "Free Plan",
      stripePriceId: "price_test_free",
      mode: "test" as const,
      amount: 0,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    // Starter — monthly test price
    {
      productSlug: "starter",
      label: "Starter Monthly",
      stripePriceId: "price_test_starter_monthly",
      mode: "test" as const,
      amount: 9.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    // Starter — yearly test price (discounted)
    {
      productSlug: "starter",
      label: "Starter Yearly",
      stripePriceId: "price_test_starter_yearly",
      mode: "test" as const,
      amount: 99.99,
      currency: "USD",
      interval: "year",
      isDefault: false,
    },
    // Pro — monthly test price
    {
      productSlug: "pro",
      label: "Pro Monthly",
      stripePriceId: "price_test_pro_monthly",
      mode: "test" as const,
      amount: 29.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    // Enterprise — monthly test price
    {
      productSlug: "enterprise",
      label: "Enterprise Monthly",
      stripePriceId: "price_test_enterprise_monthly",
      mode: "test" as const,
      amount: 99.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    // Premium — monthly test price
    {
      productSlug: "premium-membership",
      label: "Premium Monthly",
      stripePriceId: "price_test_premium_monthly",
      mode: "test" as const,
      amount: 19.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    // SEO Report — one-time test price
    {
      productSlug: "seo-report",
      label: "SEO Report",
      stripePriceId: "price_test_seo_report",
      mode: "test" as const,
      amount: 49.99,
      currency: "USD",
      interval: null,
      isDefault: true,
    },
    // API Access Pass — one-time test price
    {
      productSlug: "api-access-pass",
      label: "API Access Pass",
      stripePriceId: "price_test_api_access",
      mode: "test" as const,
      amount: 199.99,
      currency: "USD",
      interval: null,
      isDefault: true,
    },
    // --- Live-mode placeholder prices (replace stripePriceId with real Stripe IDs) ---
    {
      productSlug: "free",
      label: "Free Plan",
      stripePriceId: "price_live_free",
      mode: "live" as const,
      amount: 0,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    {
      productSlug: "starter",
      label: "Starter Monthly",
      stripePriceId: "price_live_starter_monthly",
      mode: "live" as const,
      amount: 9.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    {
      productSlug: "starter",
      label: "Starter Yearly",
      stripePriceId: "price_live_starter_yearly",
      mode: "live" as const,
      amount: 99.99,
      currency: "USD",
      interval: "year",
      isDefault: false,
    },
    {
      productSlug: "pro",
      label: "Pro Monthly",
      stripePriceId: "price_live_pro_monthly",
      mode: "live" as const,
      amount: 29.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    {
      productSlug: "enterprise",
      label: "Enterprise Monthly",
      stripePriceId: "price_live_enterprise_monthly",
      mode: "live" as const,
      amount: 99.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    {
      productSlug: "premium-membership",
      label: "Premium Monthly",
      stripePriceId: "price_live_premium_monthly",
      mode: "live" as const,
      amount: 19.99,
      currency: "USD",
      interval: "month",
      isDefault: true,
    },
    {
      productSlug: "seo-report",
      label: "SEO Report",
      stripePriceId: "price_live_seo_report",
      mode: "live" as const,
      amount: 49.99,
      currency: "USD",
      interval: null,
      isDefault: true,
    },
    {
      productSlug: "api-access-pass",
      label: "API Access Pass",
      stripePriceId: "price_live_api_access",
      mode: "live" as const,
      amount: 199.99,
      currency: "USD",
      interval: null,
      isDefault: true,
    },
  ];

  for (const p of pricesToSeed) {
    const productId = seededProducts[p.productSlug];
    if (!productId) continue;

    // Find existing price by product + mode + label to upsert
    const existing = await prisma.productPrice.findFirst({
      where: { productId, mode: p.mode, label: p.label },
    });

    if (existing) {
      await prisma.productPrice.update({
        where: { id: existing.id },
        data: {
          stripePriceId: p.stripePriceId,
          amount: p.amount,
          currency: p.currency,
          interval: p.interval,
          isDefault: p.isDefault,
        },
      });
    } else {
      await prisma.productPrice.create({
        data: {
          productId,
          label: p.label,
          stripePriceId: p.stripePriceId,
          mode: p.mode,
          amount: p.amount,
          currency: p.currency,
          interval: p.interval,
          startDate: new Date(),
          isDefault: p.isDefault,
        },
      });
    }
    console.log(`ProductPrice seeded: ${p.label} (${p.mode})`);
  }

  // Seed sample purchase file for demo user's starter subscription
  const sampleFileContent = Buffer.from(
    "Welcome to Starter! This is your getting-started guide.",
    "utf-8",
  ).toString("base64");
  const existingFile = await prisma.purchaseFile.findFirst({
    where: { purchaseId: purchase.id, fileName: "starter-guide.txt" },
  });
  if (!existingFile) {
    await prisma.purchaseFile.create({
      data: {
        purchaseId: purchase.id,
        fileName: "starter-guide.txt",
        mimeType: "text/plain",
        sizeBytes: Buffer.from(sampleFileContent, "base64").length,
        data: sampleFileContent,
      },
    });
    console.log("PurchaseFile seeded: starter-guide.txt for Demo User");
  } else {
    console.log("PurchaseFile already exists: starter-guide.txt");
  }

  // ---------------------------------------------------------------------------
  // Seed sample user invitation (demonstrates the invitation system)
  // ---------------------------------------------------------------------------
  const crypto = await import("crypto");
  const inviteToken = crypto.randomBytes(32).toString("base64url");
  const inviteHash = crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(inviteToken)
    .digest("hex");

  const existingInvite = await prisma.userInvitation.findFirst({
    where: { env, email: "invited@demo.com" },
  });
  if (!existingInvite) {
    await prisma.userInvitation.create({
      data: {
        env,
        email: "invited@demo.com",
        name: "Invited User",
        tokenHash: inviteHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedBy: admin.id,
      },
    });
    console.log("UserInvitation seeded: invited@demo.com (pending)");
    console.log(`  Accept link: /accept-invitation?token=${inviteToken}`);
  } else {
    console.log("UserInvitation already exists: invited@demo.com");
  }

  // ---------------------------------------------------------------------------
  // Seed CMS content types
  // ---------------------------------------------------------------------------
  const contentTypes = [
    {
      name: "Blog Post",
      slug: "blog-posts",
      pluralName: "Blog Posts",
      description: "Blog articles and news",
      icon: "file-text",
      // Standard fields (body, excerpt, featuredImage, author, etc.) are
      // always persisted by the API — only list EXTRA type-specific fields here.
      fields: [
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["news", "tutorial", "update"],
          required: false,
        },
      ],
      settings: {
        hasSlug: true,
        hasStatus: true,
        slugSource: "title",
        defaultStatus: "draft",
      },
      listDisplay: {
        titleField: "title",
        subtitleField: "excerpt",
        imageField: "featuredImage",
      },
      publicSettings: {
        hasPublicList: true,
        hasDetailPage: true,
        urlPrefix: "blog-posts",
      },
      status: "active",
      sortOrder: 0,
      env,
    },
    {
      name: "Service",
      slug: "services",
      pluralName: "Services",
      description: "Services offered",
      icon: "briefcase",
      // Standard fields (body, excerpt, featuredImage, author, etc.) are
      // always persisted by the API — only list EXTRA type-specific fields here.
      fields: [
        {
          name: "price",
          label: "Starting Price",
          type: "text",
          required: false,
        },
      ],
      settings: {
        hasSlug: true,
        hasStatus: true,
        slugSource: "title",
        defaultStatus: "draft",
      },
      listDisplay: {
        titleField: "title",
        subtitleField: "excerpt",
        imageField: "featuredImage",
      },
      publicSettings: {
        hasPublicList: true,
        hasDetailPage: true,
        urlPrefix: "services",
      },
      status: "active",
      sortOrder: 1,
      env,
    },
    {
      name: "FAQ",
      slug: "faqs",
      pluralName: "FAQs",
      description: "Frequently asked questions",
      icon: "help-circle",
      fields: [
        { name: "answer", label: "Answer", type: "rich-text", required: true },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["general", "billing", "technical"],
          required: false,
        },
        {
          name: "sortOrder",
          label: "Sort Order",
          type: "number",
          required: false,
        },
      ],
      settings: {
        hasSlug: true,
        hasStatus: true,
        hasSortOrder: true,
        slugSource: "title",
        defaultStatus: "draft",
      },
      listDisplay: { titleField: "title", subtitleField: "category" },
      publicSettings: {
        hasPublicList: true,
        hasDetailPage: true,
        urlPrefix: "faqs",
      },
      status: "active",
      sortOrder: 2,
      env,
    },
  ];

  for (const ct of contentTypes) {
    await prisma.contentType.upsert({
      where: { env_slug: { env, slug: ct.slug } },
      update: {
        name: ct.name,
        pluralName: ct.pluralName,
        description: ct.description,
        icon: ct.icon,
        fields: ct.fields,
        settings: ct.settings,
        listDisplay: ct.listDisplay,
        publicSettings: ct.publicSettings,
        status: ct.status,
        sortOrder: ct.sortOrder,
      },
      create: ct,
    });
    console.log(`ContentType seeded: ${ct.name}`);
  }

  // Seed CMS taxonomies
  const taxonomies = [
    {
      name: "Category",
      slug: "categories",
      pluralName: "Categories",
      description: "Content categories",
      contentTypes: ["blog-posts", "services"],
      status: "active",
      sortOrder: 0,
      env,
    },
    {
      name: "Tag",
      slug: "tags",
      pluralName: "Tags",
      description: "Content tags",
      contentTypes: ["blog-posts"],
      status: "active",
      sortOrder: 1,
      env,
    },
  ];

  for (const tax of taxonomies) {
    await prisma.taxonomy.upsert({
      where: { env_slug: { env, slug: tax.slug } },
      update: {
        name: tax.name,
        pluralName: tax.pluralName,
        description: tax.description,
        contentTypes: tax.contentTypes,
        status: tax.status,
        sortOrder: tax.sortOrder,
      },
      create: tax,
    });
    console.log(`Taxonomy seeded: ${tax.name}`);
  }

  // ---------------------------------------------------------------------------
  // Seed block templates (ACF flexible content layouts)
  // ---------------------------------------------------------------------------
  const blockTemplates = [
    {
      name: "Hero Banner",
      slug: "hero",
      description:
        "Full-width hero section with heading, text, image and CTA buttons",
      icon: "layout-template",
      category: "layout",
      fields: [
        { name: "eyebrow", label: "Small Label", type: "text", width: "half" },
        {
          name: "title",
          label: "Main Heading",
          type: "text",
          required: true,
          width: "half",
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          width: "full",
        },
        {
          name: "imageUrl",
          label: "Hero Image URL",
          type: "media",
          width: "full",
        },
        {
          name: "primaryLabel",
          label: "Primary Button Label",
          type: "text",
          width: "half",
        },
        {
          name: "primaryHref",
          label: "Primary Button Link",
          type: "url",
          width: "half",
        },
        {
          name: "secondaryLabel",
          label: "Secondary Button Label",
          type: "text",
          width: "half",
        },
        {
          name: "secondaryHref",
          label: "Secondary Button Link",
          type: "url",
          width: "half",
        },
      ],
      defaults: { primaryLabel: "Learn More", primaryHref: "/" },
      status: "active",
      sortOrder: 0,
      env,
    },
    {
      name: "Rich Text",
      slug: "rich-text",
      description: "A text section with a title and HTML body content",
      icon: "file-text",
      category: "content",
      fields: [
        { name: "title", label: "Section Title", type: "text", width: "full" },
        {
          name: "body",
          label: "Content (HTML)",
          type: "rich-text",
          required: true,
          width: "full",
        },
      ],
      status: "active",
      sortOrder: 1,
      env,
    },
    {
      name: "Feature Grid",
      slug: "feature-grid",
      description:
        "Grid of feature cards with title, description and optional image",
      icon: "grid-3x3",
      category: "content",
      fields: [
        { name: "title", label: "Section Title", type: "text", width: "half" },
        {
          name: "description",
          label: "Section Description",
          type: "textarea",
          width: "full",
        },
        {
          name: "items",
          label: "Feature Cards",
          type: "repeater",
          width: "full",
          subFields: [
            { name: "title", label: "Card Title", type: "text", width: "half" },
            {
              name: "imageUrl",
              label: "Card Image URL",
              type: "media",
              width: "half",
            },
            {
              name: "description",
              label: "Card Description",
              type: "textarea",
              width: "full",
            },
          ],
        },
      ],
      status: "active",
      sortOrder: 2,
      env,
    },
    {
      name: "Stats Row",
      slug: "stat-grid",
      description: "Row of statistics with large numbers and labels",
      icon: "bar-chart-3",
      category: "content",
      fields: [
        {
          name: "items",
          label: "Stats",
          type: "repeater",
          width: "full",
          subFields: [
            { name: "value", label: "Value", type: "text", width: "half" },
            { name: "label", label: "Label", type: "text", width: "half" },
          ],
        },
      ],
      status: "active",
      sortOrder: 3,
      env,
    },
    {
      name: "Image Gallery",
      slug: "image-gallery",
      description: "Grid of images with optional captions",
      icon: "image",
      category: "media",
      fields: [
        { name: "title", label: "Gallery Title", type: "text", width: "full" },
        {
          name: "images",
          label: "Images",
          type: "repeater",
          width: "full",
          subFields: [
            { name: "url", label: "Image URL", type: "media", width: "half" },
            { name: "alt", label: "Alt Text", type: "text", width: "half" },
            { name: "caption", label: "Caption", type: "text", width: "full" },
          ],
        },
      ],
      status: "active",
      sortOrder: 4,
      env,
    },
    {
      name: "Document List",
      slug: "document-list",
      description: "List of downloadable documents with links",
      icon: "folder-open",
      category: "content",
      fields: [
        { name: "title", label: "Section Title", type: "text", width: "full" },
        {
          name: "documents",
          label: "Documents",
          type: "repeater",
          width: "full",
          subFields: [
            {
              name: "label",
              label: "Document Name",
              type: "text",
              width: "half",
            },
            { name: "url", label: "Document URL", type: "url", width: "half" },
            { name: "type", label: "File Type", type: "text", width: "half" },
          ],
        },
      ],
      status: "active",
      sortOrder: 5,
      env,
    },
    {
      name: "Call to Action",
      slug: "cta",
      description: "Centered CTA section with heading, description and button",
      icon: "megaphone",
      category: "cta",
      fields: [
        {
          name: "title",
          label: "Heading",
          type: "text",
          required: true,
          width: "half",
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          width: "full",
        },
        {
          name: "buttonLabel",
          label: "Button Label",
          type: "text",
          width: "half",
        },
        {
          name: "buttonHref",
          label: "Button Link",
          type: "url",
          width: "half",
        },
      ],
      defaults: { buttonLabel: "Get Started", buttonHref: "/contact" },
      status: "active",
      sortOrder: 6,
      env,
    },
    {
      name: "Two Column",
      slug: "two-column",
      description: "Side-by-side text and image section",
      icon: "columns-2",
      category: "layout",
      fields: [
        { name: "title", label: "Title", type: "text", width: "full" },
        {
          name: "body",
          label: "Content (HTML)",
          type: "rich-text",
          width: "full",
        },
        { name: "imageUrl", label: "Image URL", type: "media", width: "full" },
        {
          name: "imagePosition",
          label: "Image Position",
          type: "select",
          options: ["left", "right"],
          width: "half",
        },
      ],
      defaults: { imagePosition: "right" },
      status: "active",
      sortOrder: 7,
      env,
    },
    {
      name: "Testimonials",
      slug: "testimonials",
      description: "Customer testimonials grid",
      icon: "quote",
      category: "content",
      fields: [
        { name: "title", label: "Section Title", type: "text", width: "full" },
        {
          name: "items",
          label: "Testimonials",
          type: "repeater",
          width: "full",
          subFields: [
            { name: "quote", label: "Quote", type: "textarea", width: "full" },
            { name: "name", label: "Author Name", type: "text", width: "half" },
            { name: "role", label: "Author Role", type: "text", width: "half" },
            {
              name: "avatarUrl",
              label: "Avatar URL",
              type: "media",
              width: "half",
            },
          ],
        },
      ],
      status: "active",
      sortOrder: 8,
      env,
    },
  ];

  for (const bt of blockTemplates) {
    await prisma.blockTemplate.upsert({
      where: { env_slug: { env, slug: bt.slug } },
      update: {
        name: bt.name,
        description: bt.description,
        icon: bt.icon,
        category: bt.category,
        fields: bt.fields,
        defaults: (bt as Record<string, unknown>).defaults ?? undefined,
        status: bt.status,
        sortOrder: bt.sortOrder,
      },
      create: bt,
    });
    console.log(`BlockTemplate seeded: ${bt.name}`);
  }

  // ---------------------------------------------------------------------------
  // Seed CMS pages
  // ---------------------------------------------------------------------------
  const pages = [
    {
      title: "Home",
      slug: "home",
      status: "published",
      isHomepage: true,
      seoTitle: "Welcome",
      seoDescription: "Welcome to our platform",
      blocks: [
        {
          templateSlug: "hero-banner",
          data: {
            heading: "Welcome to Our Platform",
            subheading: "Build something great",
            ctaText: "Get Started",
            ctaUrl: "/user-register",
          },
        },
      ],
      env,
    },
    {
      title: "About Us",
      slug: "about",
      status: "published",
      isHomepage: false,
      seoTitle: "About Us",
      seoDescription: "Learn more about our team and mission",
      blocks: [
        {
          templateSlug: "rich-text",
          data: {
            content:
              "<h2>Our Mission</h2><p>We build tools that empower creators and businesses to succeed online.</p>",
          },
        },
      ],
      env,
    },
  ];

  for (const page of pages) {
    await prisma.page.upsert({
      where: { env_slug: { env, slug: page.slug } },
      update: {
        title: page.title,
        status: page.status,
        isHomepage: page.isHomepage,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        blocks: page.blocks,
      },
      create: page,
    });
    console.log(`Page seeded: ${page.title}`);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
