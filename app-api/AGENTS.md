<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Coding Rules

- **All types in `types/`**: Every `type`, `interface`, and `enum` must be defined in `app-api/types/` and re-exported from `types/index.ts`. Never define types inline in services, controllers, repositories, or lib files. Import from `@/types`.
- **No Prisma in services**: Services call repositories. Repositories call Prisma. Never import `prisma` directly in a service file.
- **Singleton exports**: Services and repositories are plain object literals, not classes.
- **Uniform response envelope**: All API responses use `{ ok: true, data }` or `{ ok: false, error }`.
