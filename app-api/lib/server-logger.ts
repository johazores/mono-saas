import { getRequestScope } from "@/lib/request-scope";
import type { LogLevel, ServerLogFields } from "@/types";

function write(level: LogLevel, event: string, fields: ServerLogFields): void {
  const scope = getRequestScope();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: fields.requestId ?? scope?.requestId ?? null,
    tenantId: fields.tenantId ?? scope?.tenantId ?? null,
    ...fields,
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
    const err = error instanceof Error ? error : new Error(String(error));
    const digest = (err as Error & { digest?: string }).digest;

    write("error", event, {
      ...fields,
      errorName: err.name,
      errorMessage: err.message,
      errorDigest: digest,
    });
  },
};
