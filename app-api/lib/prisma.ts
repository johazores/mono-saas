import { getAppEnv } from "./env";
import { basePrisma } from "./base-prisma";

export { basePrisma };

/** Models that carry an `env` field for environment scoping. */
const ENV_SCOPED_MODELS = new Set([
  "User",
  "UserSession",
  "Product",
  "ProductPrice",
  "Purchase",
  "PurchaseFile",
  "Membership",
  "Feature",
  "ActivityLog",
  "SiteSetting",
  "CheckoutSession",
  "Page",
  "ContentType",
  "ContentItem",
  "Taxonomy",
  "TaxonomyTerm",
  "Media",
  "BlockTemplate",
]);

function isEnvScoped(model: string | undefined): boolean {
  return !!model && ENV_SCOPED_MODELS.has(model);
}

function createExtendedClient() {
  return basePrisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!isEnvScoped(model)) return query(args);

        const env = await getAppEnv();

        // Ensure a where clause exists for read/update/delete operations that
        // support filtering (findMany, updateMany, deleteMany, count, etc.)
        const needsWhere = [
          "findMany",
          "updateMany",
          "deleteMany",
          "count",
          "aggregate",
          "groupBy",
        ];
        if (
          needsWhere.includes(operation) &&
          !("where" in args && args.where)
        ) {
          (args as Record<string, unknown>).where = {};
        }

        // Inject env into where clause for read / update / delete operations
        if (
          "where" in args &&
          args.where &&
          typeof args.where === "object" &&
          !("env" in args.where)
        ) {
          (args.where as Record<string, unknown>).env = env;
        }

        // Inject env into data for create operations
        if (operation === "create" && "data" in args && args.data) {
          if (
            typeof args.data === "object" &&
            !Array.isArray(args.data) &&
            !("env" in args.data)
          ) {
            (args.data as Record<string, unknown>).env = env;
          }
        }

        // Inject env into each item for createMany
        if (operation === "createMany" && "data" in args && args.data) {
          if (Array.isArray(args.data)) {
            for (const item of args.data) {
              if (typeof item === "object" && item && !("env" in item)) {
                (item as Record<string, unknown>).env = env;
              }
            }
          }
        }

        // Inject env into upsert create data
        if (operation === "upsert" && "create" in args && args.create) {
          if (
            typeof args.create === "object" &&
            !Array.isArray(args.create) &&
            !("env" in args.create)
          ) {
            (args.create as Record<string, unknown>).env = env;
          }
        }

        return query(args);
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createExtendedClient>;
};

export const prisma = globalForPrisma.prisma ?? createExtendedClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
