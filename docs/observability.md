# Observability

- **Status:** Current baseline; route-wide tenant/actor correlation still in progress
- **Last verified:** 2026-07-25
- **Roadmap:** T-1402

## Goals

The production baseline should answer four questions without exposing secrets:

1. Which request failed?
2. Which route and method were involved?
3. Which tenant context was active?
4. Which authenticated actor or audit event is associated with that request?

The current implementation establishes the first three for request-scoped code and correlates audit actor records through the same request/tenant identifiers. Universal route adoption and tenant membership resolution remain part of T-301/T-305.

## Structured server logs

`app-api/lib/server-logger.ts` emits one JSON object per line with these core fields:

- `timestamp`
- `level`
- `event`
- `requestId`
- `tenantId`
- optional route/method/status/actor/resource fields
- bounded error name/message/digest for error events

The logger does not serialize request bodies or error stacks by default. Error messages are bounded and redact common URL credentials, bearer tokens, Stripe-style secret keys, and sensitive query parameters before writing them.

Example shape:

```json
{
  "timestamp": "2026-07-25T12:00:00.000Z",
  "level": "error",
  "event": "server.request_error",
  "requestId": "request-123",
  "tenantId": "tenant-123",
  "route": "/api/example",
  "method": "POST",
  "errorName": "Error",
  "errorMessage": "Database unavailable"
}
```

## Request IDs

`withRequestScope()` accepts an inbound `x-request-id` when present, bounds it to 128 characters, or generates a UUID. Scoped API responses return the selected value as `X-Request-Id`.

This lets a client/support report quote a request ID that can be searched directly in server logs and activity logs.

A public tenant header is still ignored. Tenant identity must not become caller-selectable before authoritative membership/host resolution exists.

## Global server errors

`app-api/instrumentation.ts` uses Next.js `onRequestError` to emit `server.request_error` for uncaught server request failures. It records route/method/path and uses the inbound request ID when available. Request-scoped code can additionally supply the AsyncLocalStorage request/tenant context through `serverLogger`.

## Activity-log correlation

`logActivity()` appends trusted request-scope correlation to metadata:

- `requestId`
- `tenantId` when present

Caller-provided metadata cannot override these trusted scope values. Existing audit actor, resource, IP, method, path, and user-agent fields remain unchanged.

This provides a join point between server failures and authenticated audit events without copying actor/session data into every server log entry.

## Health endpoints

### `GET /api/health`

Process liveness only. It intentionally does **not** query MongoDB.

Success: `200`

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "service": "app-api",
    "timestamp": "..."
  }
}
```

### `GET /api/health/ready`

Readiness check. Performs a minimal MongoDB query through infrastructure `basePrisma`.

- `200` when the API can reach MongoDB
- `503` when MongoDB is unavailable

The response reports only `database: "ok" | "unavailable"`. Database errors, hosts, credentials, and connection strings are never returned to the caller.

Both endpoints set `Cache-Control: no-store` and return `X-Request-Id`.

## Remaining work

T-1402 stays in progress until:

- T-301 applies request scope consistently across all API route groups;
- T-305 resolves a real `tenantId` from authoritative membership/host data;
- authenticated actor context can be correlated for all relevant error paths rather than only through activity events;
- deployment documentation identifies the production log/error sink and health-check configuration.
