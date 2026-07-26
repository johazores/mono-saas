import { getAppEnv } from "./env";
import { basePrisma } from "./base-prisma";
import { getTenantId } from "./request-scope";
import { applyEnvScope, isEnvScopedModel } from "./prisma-scope";
import { applyTenantStagingCreates } from "./prisma-tenant-staging";

export { basePrisma };

function createExtendedClient() {
  return basePrisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!isEnvScopedModel(model)) return query(args);

        const env = await getAppEnv();
        const scopedArgs = applyEnvScope(
          operation,
          args as Record<string, unknown>,
          env,
          model,
        );
        const tenantId = getTenantId();
        if (tenantId && model) {
          applyTenantStagingCreates(operation, scopedArgs, tenantId, model);
        }

        return query(scopedArgs as typeof args);
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
