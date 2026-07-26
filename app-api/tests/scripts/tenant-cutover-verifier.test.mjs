import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const entryScript = path.join(
  process.cwd(),
  "scripts",
  "verify-tenant-cutover-entry.mjs",
);
const verifierScript = path.join(
  process.cwd(),
  "scripts",
  "verify-tenant-cutover.mjs",
);

function run(args) {
  return spawnSync(process.execPath, [entryScript, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "mongodb://127.0.0.1:27017/mono-saas-test",
    },
  });
}

describe("tenant cutover verifier CLI", () => {
  it("prints help without requiring database access", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tenant cutover verifier (read-only)");
    expect(result.stdout).toContain("T-1301");
  });

  it("requires an explicit tenant key before database access", () => {
    const result = run([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--tenant-key is required");
  });

  it("rejects unsafe tenant keys before database access", () => {
    const result = run(["--tenant-key", "../other-tenant"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--tenant-key must be lowercase alphanumeric with hyphens",
    );
  });

  it("rejects unexpected arguments before database access", () => {
    const result = run(["--tenant-key", "default", "--apply"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected argument: --apply");
  });
});

describe("tenant cutover verifier source safety", () => {
  const writeCall =
    /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
  const rawWrite = /\$(executeRaw|executeRawUnsafe|runCommandRaw)\s*\(/;

  it("contains no Prisma write operation in either verifier stage", () => {
    for (const script of [entryScript, verifierScript]) {
      const source = fs.readFileSync(script, "utf8");
      expect(source).not.toMatch(writeCall);
      expect(source).not.toMatch(rawWrite);
    }
  });

  it("exposes no apply mode", () => {
    const coreSource = fs.readFileSync(verifierScript, "utf8");
    expect(coreSource).not.toContain("--apply");
  });

  it("routes the package verification command through the ownership gate", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    );
    expect(packageJson.scripts["db:tenant:verify"]).toBe(
      "node scripts/verify-tenant-cutover-entry.mjs",
    );
  });
});
