<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Coding Rules

- **All types in `types/`**: Every reusable `type`, `interface`, and `enum` belongs in `app-api/types/` and is re-exported from `types/index.ts`. Import shared contracts from `@/types`. Small file-private helper shapes may remain local when they are not application contracts.
- **Layering**: API routes are thin; controllers own transport/auth/validation; services own business rules; repositories own Prisma access.
- **No Prisma in services**: Services call repositories. Repositories call Prisma. Cross-cutting infrastructure in `lib/` may use Prisma only when it is explicitly a persistence/session boundary.
- **Singleton exports**: Services and repositories are plain object literals, not classes.
- **Uniform response envelope**: API responses use `{ ok: true, data }` or `{ ok: false, error }`. Validation failures may additionally include structured `details`.
- **Provider boundaries**: Shared auth/payment/storage contracts must remain provider-neutral. Provider-native SDK/response types stay inside adapters.
- **Tenant safety**: Never bypass scoped Prisma from tenant/member code. `basePrisma` is infrastructure-only until a dedicated audited platform-admin boundary exists.
