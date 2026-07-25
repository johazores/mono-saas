export type TenantResolutionMode =
  | "subdomain"
  | "custom-domain"
  | "path-prefix"
  | "trusted-header";

export type TenantResolutionSource =
  | "subdomain"
  | "custom-domain"
  | "path"
  | "trusted-header";

export type TenantRequestInput = {
  host?: string;
  path?: string;
  headers: Record<string, string | string[] | undefined>;
};

export type TenantResolutionConfig = {
  mode: TenantResolutionMode;
  baseDomain?: string;
  pathPrefix?: string;
  trustedHeaderName?: string;
  trustedTimestampHeaderName?: string;
  trustedSignatureHeaderName?: string;
  trustedHeaderSecret?: string;
  maxClockSkewSeconds?: number;
};

export type TenantResolutionCandidate = {
  key: string;
  source: TenantResolutionSource;
};
