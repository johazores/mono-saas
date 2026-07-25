export type ServerLogLevel = "info" | "warn" | "error";

export type ServerLogFields = {
  requestId?: string | null;
  tenantId?: string | null;
  route?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  actorType?: "admin" | "user" | "system";
  actorId?: string;
  resource?: string;
  resourceId?: string;
  errorName?: string;
  errorMessage?: string;
  errorDigest?: string;
  [key: string]: unknown;
};

export type HealthStatus = {
  status: "ok" | "unavailable";
  service: "app-api";
  database?: "ok" | "unavailable";
  timestamp: string;
};
