# WebApi Authorization Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit safe, cross-service WebApi authorization diagnostics for failed MCP tools without recording credentials, request data, raw errors, or PII.

**Architecture:** The common HTTP client generates a random trace ID, attaches two observability-only headers to existing WebApi requests, and stores safe request metadata outside request/response bodies. Typed WebApi errors carry only that metadata to the existing tool wrapper, which emits it in `mcp_tool_completed`. A WebApi contract defines one optional, enum-only authorization reason response header; MCP ignores every other value.

**Tech Stack:** Node.js 20, TypeScript, native `fetch` / `Headers`, Vitest.

---

## File Structure

- Modify: `src/api/http-client.ts` - generate trace metadata, attach trace headers, retain safe response failure metadata.
- Modify: `src/logging/mcp-http-logger.ts` - allow typed upstream failure fields on tool-completion events.
- Modify: `src/app/register-tools.ts` - preserve a caught `WebApiRequestError` metadata in the safe tool log.
- Modify: `tests/unit/webapi-error-mapping.test.ts` - cover headers, metadata, header allowlisting, tool log output, and non-disclosure.
- Modify: `docs/api-contract.md` and `tvcmall-webapi mcp开发接入说明文档.md` - document trace header and authorization-reason contract.
- Modify: `README.md` - show the extra safe tool-error fields for operators.

### Task 1: Preserve safe WebApi failure metadata

**Files:**
- Modify: `src/api/http-client.ts`
- Modify: `tests/unit/webapi-error-mapping.test.ts`

- [ ] **Step 1: Write failing tests for trace propagation and safe error metadata**

Extend `TestHttpClient` tests with a `403` response containing `X-TVCMall-MCP-Auth-Reason: scope_missing`. Assert the caught `WebApiRequestError` has only:

```ts
expect(error).toMatchObject({
  code: 'PERMISSION_DENIED',
  metadata: {
    webApiMethod: 'GET',
    normalizedRoute: 'test',
    webApiStatus: 403,
    authReason: 'scope_missing',
    traceId: expect.stringMatching(/^[0-9a-f-]{36}$/)
  }
});
expect(JSON.stringify(error)).not.toContain(pat);
expect(JSON.stringify(error)).not.toContain(upstreamBodySecret);
```

Inspect the injected fetch call and assert it preserves `Authorization`, adds `X-TVCMall-MCP-Client: tvcmall-mcp-server`, and adds a valid `X-TVCMall-MCP-Trace-Id`. Add a second `403` test with `X-TVCMall-MCP-Auth-Reason: arbitrary-text`; assert `authReason` is absent. Add network and response-body-read assertions that their `API_UNAVAILABLE` error still has trace ID, method and normalized route but no status/body/header value.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts`

Expected: FAIL because `WebApiRequestError` has no metadata and outgoing requests have no trace headers.

- [ ] **Step 3: Implement typed metadata in the common client**

In `src/api/http-client.ts`, define the narrow types:

```ts
export type WebApiAuthReason = 'scope_missing' | 'route_not_registered' | 'route_disabled';

export interface WebApiRequestMetadata {
  normalizedRoute: string;
  traceId: string;
  webApiMethod: string;
}

export interface WebApiFailureMetadata extends WebApiRequestMetadata {
  authReason?: WebApiAuthReason;
  webApiStatus?: number;
}

export class WebApiRequestError extends Error {
  constructor(readonly code: WebApiErrorCode, readonly metadata?: WebApiFailureMetadata) {
    super(code);
    this.name = 'WebApiRequestError';
  }
}
```

Before every raw fetch, generate `randomUUID()` and build request metadata from the method plus `new URL(...).pathname`: lowercase it and remove leading/trailing `/`; never include host, query, fragment, body, headers, PAT, or user input. Attach these literal headers without changing the existing Authorization value:

```ts
'X-TVCMall-MCP-Client': 'tvcmall-mcp-server',
'X-TVCMall-MCP-Trace-Id': metadata.traceId
```

Preserve object-form caller headers so existing client callers retain their `Authorization` and `Content-Type` behavior. Store request metadata in a `WeakMap<Response, WebApiRequestMetadata>` alongside cleanup callbacks. On non-success, read only `response.status` and the single `X-TVCMall-MCP-Auth-Reason` header. Accept its value only when it exactly matches the declared union, then throw `WebApiRequestError` with metadata. Network, body-read and invalid JSON-object failures must also throw `WebApiRequestError('API_UNAVAILABLE', metadata)`; failed response bodies remain cancelled and unread.

- [ ] **Step 4: Run focused test and existing HTTP-client suites**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts tests/unit/http-product-client.test.ts tests/unit/http-points-client.test.ts tests/unit/http-order-client.test.ts tests/unit/http-shipping-client.test.ts tests/unit/http-tracking-client.test.ts tests/unit/http-balance-client.test.ts`

Expected: PASS; all clients retain a single Bearer prefix and now send the observability headers.

- [ ] **Step 5: Commit the common-client change**

Run: `git add src/api/http-client.ts tests/unit/webapi-error-mapping.test.ts && git commit -m "feat: trace WebApi authorization failures"`

### Task 2: Emit metadata in safe tool-completion logs

**Files:**
- Modify: `src/logging/mcp-http-logger.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/webapi-error-mapping.test.ts`
- Modify: `tests/unit/mcp-http-logger.test.ts`

- [ ] **Step 1: Write failing tool-log tests**

Create a `WebApiRequestError('PERMISSION_DENIED', metadata)` with a valid trace ID and `scope_missing`, then invoke the existing search-products callback through `RecordingLogger`. Assert exactly these additional log fields:

```ts
expect(logger.tools).toContainEqual({
  toolName: 'tvcmall_search_products',
  outcome: 'error',
  errorCode: 'PERMISSION_DENIED',
  webApiMethod: 'GET',
  normalizedRoute: 'test',
  webApiStatus: 403,
  traceId: '00000000-0000-4000-8000-000000000000',
  authReason: 'scope_missing',
  durationMs: expect.any(Number)
});
```

Retain non-disclosure assertions for PAT, upstream body and tool input. Add a JSON-line logger test that serializes these fields and still has no generic arbitrary metadata API.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts tests/unit/mcp-http-logger.test.ts`

Expected: FAIL because `toolCompleted` accepts only tool outcome, code and duration.

- [ ] **Step 3: Extend the typed logger and wrapper**

Extend `McpHttpLogger.toolCompleted` with optional flat fields copied from `WebApiFailureMetadata`: `authReason`, `normalizedRoute`, `traceId`, `webApiMethod`, and `webApiStatus`. Do not accept a generic object, arbitrary headers, URLs or errors. In `handleToolCall`, capture `error.metadata` only when the caught value is `WebApiRequestError`, use it to build the existing stable tool result, then spread the allowed metadata into the log event. Successful and auth-context-only tool errors do not get WebApi metadata.

- [ ] **Step 4: Run logger, tool, stdio and type checks**

Run: `npm test -- tests/unit/mcp-http-logger.test.ts tests/unit/webapi-error-mapping.test.ts tests/integration/mcp-stdio.test.ts && npm run typecheck`

Expected: PASS; stdio still writes no ordinary stderr logs and failure logs contain only typed safe fields.

- [ ] **Step 5: Commit the safe tool-log change**

Run: `git add src/logging/mcp-http-logger.ts src/app/register-tools.ts tests/unit/mcp-http-logger.test.ts tests/unit/webapi-error-mapping.test.ts && git commit -m "feat: log WebApi authorization context"`

### Task 3: Publish the WebApi correlation contract and verify end-to-end behavior

**Files:**
- Modify: `tvcmall-webapi mcp开发接入说明文档.md`
- Modify: `docs/api-contract.md`
- Modify: `README.md`

- [ ] **Step 1: Update contracts and operator guidance**

Document that MCP sends the two source/trace headers only for observability, WebApi must log `X-TVCMall-MCP-Trace-Id` alongside its authorization decision, and the optional response header has exactly three legal values. State that absence or unknown values omit `authReason`; this never changes authorization. Update the operator log example to show `traceId`, method, normalized route, status and optional reason, plus the safe WebApi log lookup procedure.

- [ ] **Step 2: Run documentation checks**

Run: `npm test -- tests/unit/remote-readme.test.ts tests/unit/runtime-config.test.ts && git diff --check`

Expected: PASS and no whitespace errors.

- [ ] **Step 3: Run full verification**

Run: `npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests pass, type check/build exit 0 and the diff is whitespace-clean.

- [ ] **Step 4: Manually verify a synthetic 403 log**

Use a local stub WebApi that returns `403` with `X-TVCMall-MCP-Auth-Reason: scope_missing`; invoke the points tool with a synthetic PAT and verify the resulting stderr record includes the safe route/status/trace/reason fields and excludes the PAT, Authorization and response body. Repeat with an unknown reason header and verify it is omitted.

- [ ] **Step 5: Commit documentation and verification changes**

Run: `git add README.md docs/api-contract.md 'tvcmall-webapi mcp开发接入说明文档.md' && git commit -m "docs: define WebApi authorization tracing"`
