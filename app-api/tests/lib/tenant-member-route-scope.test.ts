import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scopedRoutes = [
  "pages/api/products/public.ts",
  "pages/api/users/auth/purchases.ts",
  "pages/api/users/auth/downloads.ts",
  "pages/api/users/auth/downloads/[fileId].ts",
  "pages/api/users/auth/features.ts",
  "pages/api/users/auth/sub-users/index.ts",
  "pages/api/users/auth/sub-users/[id].ts",
  "pages/api/checkout/index.ts",
  "pages/api/checkout/verify.ts",
  "pages/api/cms/media/[id]/file.ts",
  "pages/api/cms/public/homepage.ts",
  "pages/api/cms/public/pages/index.ts",
  "pages/api/cms/public/pages/[slug].ts",
  "pages/api/cms/public/content/[typeSlug]/index.ts",
  "pages/api/cms/public/content/[typeSlug]/[slug].ts",
  "pages/api/cms/public/block-templates.ts",
];

describe("tenant-owned route request scope", () => {
  for (const route of scopedRoutes) {
    it(`${route} establishes request scope`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source).toContain('from "@/lib/api-request-scope"');
      expect(source).toContain("withRequestScope(");
    });
  }
});
