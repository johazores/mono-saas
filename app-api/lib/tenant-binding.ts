import { basePrisma } from "@/lib/base-prisma";
import { resolveConfiguredTenantCandidate } from "@/lib/tenant-resolution-config";
import type { RequestScopeSource } from "@/lib/request-scope";
import type {
  TenantRequestInput,
  TenantResolutionCandidate,
  TenantResolutionSource,
} from "@/types";

export type AuthoritativeTenant = {
  id: string;
  key: string;
  source: RequestScopeSource;
};

export class TenantBindingError extends Error {
  constructor() {
    super("Tenant could not be resolved.");
    this.name = "TenantBindingError";
  }
}

function requestScopeSource(source: TenantResolutionSource): RequestScopeSource {
  switch (source) {
    case "subdomain":
    case "custom-domain":
      return "host";
    case "path":
      return "path";
    case "trusted-header":
      return "trusted-header";
  }
}

async function resolveKeyCandidate(
  candidate: TenantResolutionCandidate,
): Promise<AuthoritativeTenant> {
  const tenant = await basePrisma.tenant.findUnique({
    where: { key: candidate.key },
    select: { id: true, key: true, status: true },
  });

  if (!tenant || tenant.status !== "active") {
    throw new TenantBindingError();
  }

  return {
    id: tenant.id,
    key: tenant.key,
    source: requestScopeSource(candidate.source),
  };
}

async function resolveDomainCandidate(
  candidate: TenantResolutionCandidate,
): Promise<AuthoritativeTenant> {
  const domain = await basePrisma.tenantDomain.findUnique({
    where: { host: candidate.key },
    select: {
      tenant: {
        select: { id: true, key: true, status: true },
      },
    },
  });

  if (!domain || domain.tenant.status !== "active") {
    throw new TenantBindingError();
  }

  return {
    id: domain.tenant.id,
    key: domain.tenant.key,
    source: "host",
  };
}

/**
 * Resolve an untrusted request candidate to an authoritative database tenant.
 *
 * This uses basePrisma intentionally because tenant selection happens before
 * tenant-scoped Prisma is allowed to execute. A request with no candidate keeps
 * deployment scope. A candidate that does not map to an active tenant fails
 * closed rather than silently falling back to deployment scope.
 */
export async function resolveAuthoritativeTenant(
  input: TenantRequestInput,
): Promise<AuthoritativeTenant | null> {
  const candidate = await resolveConfiguredTenantCandidate(input);
  if (!candidate) return null;

  return candidate.source === "custom-domain"
    ? resolveDomainCandidate(candidate)
    : resolveKeyCandidate(candidate);
}
