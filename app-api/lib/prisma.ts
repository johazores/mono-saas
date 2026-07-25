import { getAppEnv } from "./env";
import { basePrisma } from "./base-prisma";
import { applyEnvScope, isEnvScopedModel } from "./prisma-scope";

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
