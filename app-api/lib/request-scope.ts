import { AsyncLocalStorage } from "node:async_hooks";

export type RequestScopeSource =
  | "deployment"
  | "membership"
  | "host"
  | "trusted-header"
  | "platform-admin";

export type RequestScope = Readonly<{
  requestId: string;
  env?: "dev" | "production";
  tenantId?: string;
  source: RequestScopeSource;
}>;

const requestScopeStorage = new AsyncLocalStorage<RequestScope>();

/**
 * Run work inside an immutable request-local scope.
 *
 * AsyncLocalStorage keeps this state isolated across concurrent promises in the
 * same Node process. The copied/frozen snapshot also prevents callers from
 * mutating the scope object after it has been established.
 */
export function runWithRequestScope<T>(
  scope: RequestScope,
  callback: () => T,
): T {
  const snapshot = Object.freeze({ ...scope });
  return requestScopeStorage.run(snapshot, callback);
}

export function getRequestScope(): RequestScope | null {
  return requestScopeStorage.getStore() ?? null;
}

export function getRequestId(): string | null {
  return requestScopeStorage.getStore()?.requestId ?? null;
}

export function getTenantId(): string | null {
  return requestScopeStorage.getStore()?.tenantId ?? null;
}

export function requireTenantId(): string {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error("Tenant context is required for this operation.");
  }
  return tenantId;
}
