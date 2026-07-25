# Observability

- **Status:** Baseline implemented; universal tenant/actor correlation remains in progress
- **Last verified:** 2026-07-25
- **Roadmap:** T-1402

## Goals

The server observability baseline should let an operator answer:

1. Which request failed?
2. Which route and method were involved?
3. Which verified tenant scope was active?
4. Which audit actor/resource event is associated with the request?

The current implementation establishes request correlation and consumes tenant context when it already exists. T-301/T-305 must still make verified tenant scope universal across tenant API routes.

## Structured server logs

`app-api/lib/server-logger.ts` emits one JSON object per line with core fields such as:

- `timestamp`
- `level`
- `event`
- `requestId`
- `tenantId`
- optional route, path, method, status, actor, and resource fields
- bounded error name/message/digest for error events

The logger does not serialize request bodies or error stacks by default.

Error messages are limited to 2,000 characters and redact common URL credentials, bearer tokens, Stripe-style secret keys, and sensitive query-string values before output.

## Request IDs

`withRequestScope()` accepts a caller-provided `x-request-id` only as a correlation value, bounds it to 128 characters, or generates a UUID when absent. Scoped API responses return the selected value as `X-Request-Id`.

A request ID is not authorization data. Public `x-tenant-id` remains ignored.

## Uncaught server errors

The root `app-api/instrumentation.ts` keeps bootstrap validation in `register()` and also implements Next.js `onRequestError`.

Uncaught server request failures emit a `server.request_error` event with:

- request ID when supplied;
- route path;
- request path;
- HTTP method;
- router kind;
- route type;
- sanitized error identity.

Request bodies and raw headers are not copied into the error log.

## Activity-log correlation

`logActivity()` adds trusted request-scope metadata when available:

- `requestId`
- verified `tenantId`

These values are appended after caller metadata, so caller-provided `requestId` or `tenantId` values cannot override trusted request scope.

Existing actor, resource, IP, user-agent, method, and path fields are unchanged.

## Health endpoints

### `GET /api/health`

Process liveness only. It intentionally performs no MongoDB query.

Success returns `200` with the standard success envelope and:

```json
{
  "status": "ok",
  "service": "app-api",
  "timestamp": "..."
}
```

### `GET /api/health/ready`

Readiness performs one minimal global `SystemConfig` query through infrastructure `basePrisma`.

- `200` when MongoDB responds;
- `503` with `Service unavailable.` when MongoDB cannot be reached.

Database connection details and provider error bodies are never returned to the caller.

Both endpoints return `X-Request-Id` and `Cache-Control: no-store`. Unsupported methods return `405`.

## Remaining T-1402 work

T-1402 stays in progress until:

- T-301 applies request scope consistently across API route groups;
- T-305 resolves real tenant IDs from authoritative tenant/domain/membership data;
- relevant error paths have reliable authenticated actor correlation rather than only audit-event joins;
- deployment documentation identifies the production log/error sink and configures the liveness/readiness probes.
