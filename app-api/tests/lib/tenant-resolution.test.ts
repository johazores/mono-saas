import { describe, expect, it } from "vitest";
import {
  resolveTenantCandidate,
  signTrustedTenantHeader,
} from "@/lib/tenant-resolution";
import type {
  TenantRequestInput,
  TenantResolutionConfig,
} from "@/types";

const trustedSecret = "tenant-header-secret-at-least-32-characters";
const fixedNow = new Date("2026-07-25T12:00:00.000Z");
const fixedTimestamp = String(Math.floor(fixedNow.getTime() / 1_000));

function request(
  input: Partial<TenantRequestInput> = {},
): TenantRequestInput {
  return {
    headers: {},
    ...input,
  };
}

describe("tenant resolution strategies", () => {
  it("resolves one normalized subdomain label", () => {
    expect(
      resolveTenantCandidate(
        { mode: "subdomain", baseDomain: "Example.COM" },
        request({ host: "Acme.Example.com:7001" }),
      ),
    ).toEqual({ key: "acme", source: "subdomain" });
  });

  it("rejects apex, nested, lookalike, and invalid subdomain candidates", () => {
    const config: TenantResolutionConfig = {
      mode: "subdomain",
      baseDomain: "example.com",
    };

    expect(resolveTenantCandidate(config, request({ host: "example.com" }))).toBeNull();
    expect(
      resolveTenantCandidate(config, request({ host: "foo.bar.example.com" })),
    ).toBeNull();
    expect(
      resolveTenantCandidate(
        config,
        request({ host: "acme.example.com.attacker.test" }),
      ),
    ).toBeNull();
    expect(
      resolveTenantCandidate(config, request({ host: "bad_key.example.com" })),
    ).toBeNull();
  });

  it("returns a normalized hostname candidate for custom domains", () => {
    expect(
      resolveTenantCandidate(
        { mode: "custom-domain" },
        request({ host: "Portal.Customer.Example:443" }),
      ),
    ).toEqual({
      key: "portal.customer.example",
      source: "custom-domain",
    });
  });

  it("resolves a configured path-prefix candidate", () => {
    expect(
      resolveTenantCandidate(
        { mode: "path-prefix", pathPrefix: "/org" },
        request({ path: "/org/Acme/dashboard?tab=billing" }),
      ),
    ).toEqual({ key: "acme", source: "path" });
  });

  it("rejects path values outside the configured prefix or invalid tenant keys", () => {
    const config: TenantResolutionConfig = {
      mode: "path-prefix",
      pathPrefix: "/org",
    };

    expect(
      resolveTenantCandidate(config, request({ path: "/tenant/acme" })),
    ).toBeNull();
    expect(
      resolveTenantCandidate(config, request({ path: "/org/%2Facme" })),
    ).toBeNull();
    expect(
      resolveTenantCandidate(config, request({ path: "/org/bad_key" })),
    ).toBeNull();
  });

  it("accepts a signed trusted internal tenant header within clock skew", () => {
    const unsigned = request({
      host: "api.internal.example",
      path: "/api/orders?include=items",
    });
    const signature = signTrustedTenantHeader(
      trustedSecret,
      fixedTimestamp,
      "Acme",
      unsigned,
    );
    const signed = request({
      ...unsigned,
      headers: {
        "x-internal-tenant-key": "Acme",
        "x-internal-tenant-timestamp": fixedTimestamp,
        "x-internal-tenant-signature": `sha256=${signature}`,
      },
    });

    expect(
      resolveTenantCandidate(
        {
          mode: "trusted-header",
          trustedHeaderSecret: trustedSecret,
        },
        signed,
        fixedNow,
      ),
    ).toEqual({ key: "acme", source: "trusted-header" });
  });

  it("rejects public tenant-ID spoofing without a valid trusted signature", () => {
    expect(
      resolveTenantCandidate(
        {
          mode: "trusted-header",
          trustedHeaderSecret: trustedSecret,
        },
        request({ headers: { "x-tenant-id": "victim-tenant" } }),
        fixedNow,
      ),
    ).toBeNull();
  });

  it("rejects wrong signatures, stale timestamps, and replay on another path", () => {
    const unsigned = request({
      host: "api.internal.example",
      path: "/api/orders",
    });
    const signature = signTrustedTenantHeader(
      trustedSecret,
      fixedTimestamp,
      "acme",
      unsigned,
    );
    const baseHeaders = {
      "x-internal-tenant-key": "acme",
      "x-internal-tenant-timestamp": fixedTimestamp,
      "x-internal-tenant-signature": signature,
    };
    const config: TenantResolutionConfig = {
      mode: "trusted-header",
      trustedHeaderSecret: trustedSecret,
      maxClockSkewSeconds: 60,
    };

    expect(
      resolveTenantCandidate(
        config,
        request({ ...unsigned, headers: { ...baseHeaders, "x-internal-tenant-signature": "0".repeat(64) } }),
        fixedNow,
      ),
    ).toBeNull();

    expect(
      resolveTenantCandidate(
        config,
        request({ ...unsigned, headers: baseHeaders }),
        new Date(fixedNow.getTime() + 61_000),
      ),
    ).toBeNull();

    expect(
      resolveTenantCandidate(
        config,
        request({
          host: unsigned.host,
          path: "/api/admin",
          headers: baseHeaders,
        }),
        fixedNow,
      ),
    ).toBeNull();
  });

  it("uses only the configured strategy", () => {
    expect(
      resolveTenantCandidate(
        { mode: "subdomain", baseDomain: "example.com" },
        request({
          host: "example.com",
          headers: {
            "x-internal-tenant-key": "acme",
            "x-internal-tenant-timestamp": fixedTimestamp,
            "x-internal-tenant-signature": "f".repeat(64),
          },
        }),
        fixedNow,
      ),
    ).toBeNull();
  });

  it("fails closed on invalid trusted-header configuration", () => {
    expect(() =>
      resolveTenantCandidate(
        {
          mode: "trusted-header",
          trustedHeaderSecret: "short",
        },
        request(),
        fixedNow,
      ),
    ).toThrow("at least 32 characters");
  });
});
