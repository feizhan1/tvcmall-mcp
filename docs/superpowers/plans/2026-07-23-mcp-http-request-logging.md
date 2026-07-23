# MCP HTTP Request Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the remote MCP HTTP server emit safe diagnostic logs by default, with logging disabled only by `TVCMALL_LOG_LEVEL=silent`.

**Architecture:** Add a small, dependency-free JSON-line logger with a narrow typed API. Inject it into the HTTP transport and tool registration layers so request and tool outcomes are recorded without serializing headers, bodies, session IDs, credentials, PII, or raw WebApi errors. The stdio harness does not receive a logger and remains protocol-only.

**Tech Stack:** Node.js 20, TypeScript, `@modelcontextprotocol/sdk`, Vitest.

---

## File Structure

- Create: `src/logging/mcp-http-logger.ts` - level filtering and safe JSON-line stderr records.
- Modify: `src/index.ts` - create the configured logger and pass it to the HTTP entry point.
- Modify: `src/http/mcp-http-server.ts` - emit request, startup, and session lifecycle records without request data.
- Modify: `src/server.ts` and `src/app/register-tools.ts` - emit one completion record for each executed, registered tool.
- Create: `tests/unit/mcp-http-logger.test.ts` - test level filtering and safe JSON lines.
- Modify: `tests/unit/mcp-http-server.test.ts` and `tests/unit/webapi-error-mapping.test.ts` - test HTTP/tool logging and non-disclosure.
- Modify: `README.md`, `docs/api-contract.md`, `docs/harness.md` - document default behavior and the stdio boundary.

### Task 1: Create the typed, safe logger

**Files:**
- Create: `src/logging/mcp-http-logger.ts`
- Create: `tests/unit/mcp-http-logger.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { createMcpHttpLogger } from '../../src/logging/mcp-http-logger.js';

class StringOutput {
  value = '';
  write(chunk: string): boolean { this.value += chunk; return true; }
}

describe('MCP HTTP logger', () => {
  it('writes a safe info JSON line', () => {
    const output = new StringOutput();
    createMcpHttpLogger({ level: 'info', output }).requestCompleted({
      durationMs: 8, httpMethod: 'POST', httpStatus: 200,
      jsonRpcMethod: 'tools/call', requestType: 'mcp'
    });
    expect(JSON.parse(output.value)).toMatchObject({
      event: 'mcp_http_request_completed', level: 'info', durationMs: 8,
      httpMethod: 'POST', httpStatus: 200, jsonRpcMethod: 'tools/call', requestType: 'mcp'
    });
  });

  it('writes no records at the silent level', () => {
    const output = new StringOutput();
    const logger = createMcpHttpLogger({ level: 'silent', output });
    logger.serverStarted({ host: '127.0.0.1', mcpPath: '/mcp', port: 3000 });
    logger.toolCompleted({ toolName: 'tvcmall_search_products', outcome: 'success', durationMs: 4 });
    expect(output.value).toBe('');
  });
});
```

- [ ] **Step 2: Run the unit tests and verify RED**

Run: `npm test -- tests/unit/mcp-http-logger.test.ts`

Expected: FAIL because `src/logging/mcp-http-logger.ts` does not exist.

- [ ] **Step 3: Implement the narrow logger API**

Create an API that exposes only the following four methods, never a generic `log(message, fields)` method:

```ts
export interface McpHttpLogger {
  serverStarted(details: { host: string; mcpPath: string; port: number }): void;
  requestCompleted(details: {
    durationMs: number; errorCode?: McpHttpErrorCode; httpMethod: string;
    httpStatus: number; jsonRpcMethod?: string; requestType: 'healthz' | 'mcp';
  }): void;
  sessionEvent(event: 'mcp_session_created' | 'mcp_session_closed' | 'mcp_session_idle_expired'): void;
  toolCompleted(details: {
    durationMs: number; errorCode?: McpErrorCode;
    outcome: 'error' | 'success'; toolName: TvcMallToolName;
  }): void;
}
```

Define `McpHttpErrorCode` as the literal union of `AUTH_REQUIRED`, `INITIALIZE_REQUIRED`, `INVALID_REQUEST`, `NOT_FOUND`, `SESSION_CAPACITY_REACHED`, `SESSION_NOT_FOUND`, and `SESSION_REQUIRED`. Define `TvcMallToolName` as the union of all 11 registered `tvcmall_*` names. Implement `createMcpHttpLogger({ level = 'info', output = process.stderr })` with `debug < info < warn < error < silent`; write timestamped JSON lines to `output`. Use `info` for startup and successes, `warn` for 4xx/tool failures, `error` for 5xx, and `debug` for session events. Export a no-op implementation for low-level tests and stdio callers.

- [ ] **Step 4: Run the unit tests and verify GREEN**

Run: `npm test -- tests/unit/mcp-http-logger.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the logger module**

Run: `git add src/logging/mcp-http-logger.ts tests/unit/mcp-http-logger.test.ts && git commit -m "feat: add safe MCP HTTP logger"`

### Task 2: Emit remote HTTP lifecycle and request logs

**Files:**
- Modify: `src/http/mcp-http-server.ts`
- Modify: `src/index.ts`
- Modify: `tests/unit/mcp-http-server.test.ts`

- [ ] **Step 1: Write the failing HTTP logger tests**

Add a `RecordingLogger` that implements `McpHttpLogger`, make `createTestServer` accept `logger`, and add:

```ts
it('logs an initialized MCP request without its credential, session, or body', async () => {
  const logger = new RecordingLogger();
  const apiKey = 'tmcp_v1_logging-test.secret-value';
  await initialize(createTestServer({ logger }), apiKey);

  expect(logger.requests).toContainEqual(expect.objectContaining({
    httpMethod: 'POST', httpStatus: 200, jsonRpcMethod: 'initialize', requestType: 'mcp'
  }));
  expect(JSON.stringify(logger)).not.toContain(apiKey);
  expect(JSON.stringify(logger)).not.toContain('clientInfo');
  expect(JSON.stringify(logger)).not.toContain('secret-value');
});

it('logs a stable HTTP error code without the rejected credential', async () => {
  const logger = new RecordingLogger();
  const apiKey = 'tmcp_v1_invalid.secret-value';
  await dispatch({ server: createTestServer({ logger }), method: 'POST', apiKey,
    authorization: 'Bearer legacy', body: initializeRequest() });

  expect(logger.requests).toContainEqual(expect.objectContaining({ httpStatus: 401, errorCode: 'AUTH_REQUIRED' }));
  expect(JSON.stringify(logger)).not.toContain(apiKey);
});
```

Also call `startMcpHttpServer({ host: '127.0.0.1', port: 0, logger })`, assert `serverStarted` was recorded, then close the returned server in `finally`.

- [ ] **Step 2: Run the HTTP logger tests and verify RED**

Run: `npm test -- tests/unit/mcp-http-server.test.ts`

Expected: FAIL because the HTTP options have no logger and no records are emitted.

- [ ] **Step 3: Implement safe HTTP logging**

Extend `McpHttpServerOptions` with `logger?: McpHttpLogger`; use the no-op logger in `createMcpHttpServer` when it is absent. For each request, create only this metadata:

```ts
const startedAt = Date.now();
const requestLog: {
  errorCode?: McpHttpErrorCode;
  jsonRpcMethod?: string;
  requestType: 'healthz' | 'mcp';
} = { requestType: req.url === '/healthz' ? 'healthz' : 'mcp' };
```

After a JSON body has been parsed, read only a string `body.method` into `requestLog.jsonRpcMethod`; never inspect `params`. Replace each `sendHttpError` call with a local helper that first records the literal stable code into `requestLog.errorCode`. In the handler `finally`, call `logger.requestCompleted` with the metadata above, `Date.now() - startedAt`, `req.method ?? 'UNKNOWN'`, and `res.statusCode`. Do not read headers, session IDs, PATs, or auth context for logging.

Log `mcp_session_created` after a successful session is inserted, `mcp_session_idle_expired` before idle cleanup, and exactly one `mcp_session_closed` for each closed connection. Preserve every existing session cleanup, capacity, and PAT fingerprint check.

Let `startMcpHttpServer` create a default `info` logger only when no logger is injected and log the resolved listening port after `listen`. In `src/index.ts`, create `createMcpHttpLogger({ level: config.logLevel })` and pass it to `startMcpHttpServer`.

- [ ] **Step 4: Verify HTTP suites are GREEN**

Run: `npm test -- tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: PASS; session/PAT behavior is unchanged and log data contains no credentials.

- [ ] **Step 5: Commit the HTTP logging change**

Run: `git add src/http/mcp-http-server.ts src/index.ts tests/unit/mcp-http-server.test.ts && git commit -m "feat: log MCP HTTP requests safely"`

### Task 3: Emit safe registered-tool completion logs

**Files:**
- Modify: `src/server.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/webapi-error-mapping.test.ts`

- [ ] **Step 1: Write failing tool logger tests**

Pass a recording logger to `registerTvcMallTools`, then extend its existing WebApi `401` mapping test with:

```ts
expect(logger.tools).toContainEqual({
  toolName: 'tvcmall_search_products', outcome: 'error',
  errorCode: 'AUTH_REQUIRED', durationMs: expect.any(Number)
});
expect(JSON.stringify(logger)).not.toContain(pat);
expect(JSON.stringify(logger)).not.toContain(upstreamBodySecret);
expect(JSON.stringify(logger)).not.toContain('case');
```

Add a success case for `tvcmall_auth_status` that asserts `success` and no `errorCode`.

- [ ] **Step 2: Run the tool logger tests and verify RED**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts`

Expected: FAIL because tools receive no logger and complete without a log record.

- [ ] **Step 3: Implement the shared tool wrapper**

Add `logger?: McpHttpLogger` to `ServerOptions` and `RegisterToolDependencies`, and pass it from the default HTTP `createMcpServer` factory into `createTvcMallMcpServer({ authContext, logger })`. Change every registered callback to call a single wrapper with its literal `TvcMallToolName`.

```ts
async function handleToolCall(
  toolName: TvcMallToolName,
  logger: McpHttpLogger | undefined,
  operation: () => CallToolResult | Promise<CallToolResult>
): Promise<CallToolResult> {
  const startedAt = Date.now();
  let result: CallToolResult;
  try {
    result = await operation();
  } catch (error) {
    const code = error instanceof WebApiRequestError ? error.code : 'API_UNAVAILABLE';
    result = { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES[code] }] };
  }
  logger?.toolCompleted({
    toolName, outcome: result.isError ? 'error' : 'success',
    ...(result.isError ? { errorCode: readKnownMcpErrorCode(result) } : {}),
    durationMs: Date.now() - startedAt
  });
  return result;
}
```

`readKnownMcpErrorCode` may compare only known `MCP_ERROR_MESSAGES` prefixes and return `McpErrorCode | undefined`; it must not log response text. Do not log input, `structuredContent`, client URLs, response bodies, PATs, or caught error objects. The stdio entry point continues to omit the logger.

- [ ] **Step 4: Verify tool and stdio suites are GREEN**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts tests/integration/mcp-stdio.test.ts && npm run typecheck`

Expected: PASS; stdio stderr remains empty and logs expose only approved fields.

- [ ] **Step 5: Commit the tool logging change**

Run: `git add src/server.ts src/app/register-tools.ts tests/unit/webapi-error-mapping.test.ts && git commit -m "feat: log MCP tool outcomes safely"`

### Task 4: Document and manually reproduce the behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/harness.md`

- [ ] **Step 1: Update documentation**

State that `info` is the default and writes safe remote HTTP/tool completion JSON lines to stderr; only `silent` disables logs; `debug` includes session lifecycle; `warn`/`error` filter lower severity. State that logs exclude credentials, headers, bodies, session IDs, raw WebApi data, and PII, while the internal stdio harness produces no ordinary logs.

- [ ] **Step 2: Verify documentation checks**

Run: `npm test -- tests/unit/remote-readme.test.ts tests/unit/runtime-config.test.ts && git diff --check`

Expected: PASS and no whitespace errors.

- [ ] **Step 3: Run full verification**

Run: `npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests pass, TypeScript type check/build exit 0, and the diff is whitespace-clean.

- [ ] **Step 4: Reproduce the reported local scenario**

Start `npm run dev:local`. Send an MCP `initialize` request with a synthetic `tmcp_v1_diagnostic.nonsecret` credential and verify stderr contains `mcp_http_server_started` followed by `mcp_http_request_completed`. Repeat with `TVCMALL_LOG_LEVEL=silent` and verify neither record appears. Do not print the credential, request body, session header, or WebApi response.

- [ ] **Step 5: Commit the documentation**

Run: `git add README.md docs/api-contract.md docs/harness.md && git commit -m "docs: describe MCP diagnostic logging"`
