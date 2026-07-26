import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts", "verify-tenant-cutover.mjs");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
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
  it("contains no Prisma write operation", () => {
    const source = fs.readFileSync(script, "utf8");
    const writeCall =
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const rawWrite = /\$(executeRaw|executeRawUnsafe|runCommandRaw)\s*\(/;

    expect(source).not.toMatch(writeCall);
    expect(source).not.toMatch(rawWrite);
    expect(source).not.toContain("--apply");
  });
});
