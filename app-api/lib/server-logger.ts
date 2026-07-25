import { getRequestScope } from "@/lib/request-scope";
import type { ServerLogFields, ServerLogLevel } from "@/types";

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/:\/\/[^\s/@:]+:[^\s/@]+@/g, "://[redacted]@")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|rk)_(live|test)_[A-Za-z0-9_-]+\b/g, "[redacted-secret]")
    .replace(
      /([?&](?:password|token|secret|api_key|key)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function write(
  level: ServerLogLevel,
  event: string,
  fields: ServerLogFields,
): void {
  const scope = getRequestScope();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
    requestId: fields.requestId ?? scope?.requestId ?? null,
    tenantId: fields.tenantId ?? scope?.tenantId ?? null,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export const serverLogger = {
  info(event: string, fields: ServerLogFields = {}): void {
    write("info", event, fields);
  },

  warn(event: string, fields: ServerLogFields = {}): void {
    write("warn", event, fields);
  },

  error(event: string, error: unknown, fields: ServerLogFields = {}): void {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    const digest = (normalized as Error & { digest?: string }).digest;

    write("error", event, {
      ...fields,
      errorName: normalized.name,
      errorMessage: sanitizeErrorMessage(normalized.message),
      errorDigest: digest,
    });
  },
};
