import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts", "backfill-tenant-scope.mjs");

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

describe("tenant scope backfill CLI", () => {
  it("prints help without requiring a database connection", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tenant scope backfill (dry-run by default)");
    expect(result.stdout).toContain("[--apply]");
  });

  it("fails before database access when required mapping arguments are missing", () => {
    const result = run(["--source-env", "dev"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--tenant-key is required");
  });

  it("rejects unknown source environments before database access", () => {
    const result = run([
      "--source-env",
      "staging",
      "--tenant-key",
      "default",
      "--tenant-name",
      "Default Tenant",
      "--organization-slug",
      "default",
      "--organization-name",
      "Default Organization",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--source-env must be dev or production");
  });

  it("rejects unsafe tenant keys before database access", () => {
    const result = run([
      "--source-env",
      "dev",
      "--tenant-key",
      "../other-tenant",
      "--tenant-name",
      "Default Tenant",
      "--organization-slug",
      "default",
      "--organization-name",
      "Default Organization",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--tenant-key must be lowercase alphanumeric with hyphens",
    );
  });
});
