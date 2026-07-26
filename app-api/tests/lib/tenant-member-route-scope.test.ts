import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scopedRoutes = [
  "pages/api/products/public.ts",
  "pages/api/users/auth/purchases.ts",
  "pages/api/users/auth/downloads.ts",
  "pages/api/users/auth/downloads/[fileId].ts",
];

describe("tenant-owned route request scope", () => {
  for (const route of scopedRoutes) {
    it(`${route} establishes request scope`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source).toContain('from "@/lib/api-request-scope"');
      expect(source).toContain("withRequestScope(");
    });
  }

  it("does not treat checkout as adopted before its soft references are tenant-safe", () => {
    for (const route of ["pages/api/checkout/index.ts", "pages/api/checkout/verify.ts"]) {
      const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source).not.toContain("withRequestScope(");
    }
  });
});
