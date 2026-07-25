export type LogLevel = "info" | "warn" | "error";

export type ServerLogFields = {
  requestId?: string | null;
  tenantId?: string | null;
  route?: string;
  method?: string;
  actorType?: "admin" | "user" | "system";
  actorId?: string;
  resource?: string;
  resourceId?: string;
  statusCode?: number;
  durationMs?: number;
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
