# WebApi Detailed Diagnostic Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每次 MCP -> WebApi 请求输出包含脱敏 query、headers、request body 和 response body 的结构化完成日志，并保持现有认证安全边界和错误映射。

**Architecture:** 在 `src/security/webapi-log-sanitizer.ts` 集中生成安全的请求/响应日志快照；`BaseHttpClient` 负责在真实 fetch 边界采集请求信息、读取一次响应文本并同时用于日志与 JSON 解析；`mcp-http-logger.ts` 只序列化已经脱敏的 typed event。详细 payload 只存在于完成事件，不进入 `WebApiRequestError`、tool 输出或 `mcp_tool_completed`。

**Tech Stack:** Node.js 20、TypeScript、内置 Fetch API、Vitest、结构化 JSON stderr 日志。

---

## 文件结构

- Create: `src/security/webapi-log-sanitizer.ts` — 递归脱敏 headers/query/body，并生成 16 KiB 安全快照。
- Create: `tests/unit/webapi-log-sanitizer.test.ts` — 独立验证敏感字段、自由文本、UTF-8 截断和不支持 body 类型。
- Modify: `src/api/http-client.ts` — 在 fetch 边界采集请求诊断信息，读取响应正文，生成每次请求的完整完成事件。
- Modify: `tests/unit/webapi-error-mapping.test.ts` — 覆盖成功、HTTP 错误、正文读取失败、网络、超时和 callback 隔离。
- Modify: `src/logging/mcp-http-logger.ts` — 允许 typed nested diagnostics 写入 JSON 行。
- Modify: `tests/unit/mcp-http-logger.test.ts` — 验证 logger 输出详细字段，且 tool 摘要不复制正文。
- Modify: `tests/unit/remote-readme.test.ts` — 锁定 README 与 API contract 的详细日志契约。
- Modify: `README.md` — 说明默认详细日志、字段、脱敏、截断及 Docker 排查方式。
- Modify: `docs/api-contract.md` — 更新正式日志契约与安全验收项。
- Modify: `tvcmall-webapi mcp开发接入说明文档.md` — 同步 WebApi 错误正文诊断和 trace 约定。

### Task 1: 建立 WebApi 日志脱敏和快照模块

**Files:**
- Create: `src/security/webapi-log-sanitizer.ts`
- Create: `tests/unit/webapi-log-sanitizer.test.ts`

- [ ] **Step 1: 写入失败测试，定义安全日志快照契约**

测试使用以下核心断言：

```ts
import { describe, expect, it } from 'vitest';
import {
  createBodySnapshot,
  sanitizeHeaders,
  sanitizeQuery
} from '../../src/security/webapi-log-sanitizer.js';

describe('WebApi log sanitizer', () => {
  it('keeps diagnostics while redacting credentials and PII recursively', () => {
    const snapshot = createBodySnapshot(JSON.stringify({
      errorCode: 'ROUTE_DENIED',
      detail: 'route is not registered',
      password: 'plain-password',
      nested: {
        email: 'buyer@example.com',
        phone: '+1 415 555 0198',
        address: '1 Infinite Loop'
      }
    }));

    expect(snapshot).toMatchObject({
      bodyBytes: expect.any(Number),
      bodyTruncated: false,
      body: expect.stringContaining('ROUTE_DENIED')
    });
    expect(snapshot.body).toContain('route is not registered');
    expect(snapshot.body).not.toContain('plain-password');
    expect(snapshot.body).not.toContain('buyer@example.com');
    expect(snapshot.body).not.toContain('415 555 0198');
    expect(snapshot.body).not.toContain('1 Infinite Loop');
  });

  it('redacts sensitive headers but retains trace and content metadata', () => {
    expect(sanitizeHeaders(new Headers({
      Authorization: 'Bearer tmcp_v1_id.secret',
      Cookie: 'sid=secret',
      'Content-Type': 'application/json',
      'X-TVCMall-MCP-Trace-Id': '00000000-0000-4000-8000-000000000000'
    }))).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'content-type': 'application/json',
      'x-tvcmall-mcp-trace-id': '00000000-0000-4000-8000-000000000000'
    });
  });

  it('redacts query values by key and preserves repeated parameters', () => {
    expect(sanitizeQuery(new URL('https://webapi.test/path?page=2&email=a%40b.com&tag=a&tag=b'))).toEqual({
      page: '2',
      email: '[REDACTED]',
      tag: ['a', 'b']
    });
  });

  it('truncates only after redaction and preserves UTF-8 boundaries', () => {
    const snapshot = createBodySnapshot(JSON.stringify({ detail: '中'.repeat(20_000), token: 'never-log-me' }));
    expect(snapshot.bodyTruncated).toBe(true);
    expect(Buffer.byteLength(snapshot.body ?? '', 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(snapshot.body).not.toContain('never-log-me');
    expect(snapshot.body).not.toContain('\uFFFD');
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `npx vitest run tests/unit/webapi-log-sanitizer.test.ts`

Expected: FAIL，提示无法解析 `src/security/webapi-log-sanitizer.ts`。

- [ ] **Step 3: 实现递归脱敏、headers/query 处理和正文快照**

模块公开以下稳定接口：

```ts
export const WEBAPI_LOG_BODY_MAX_BYTES = 16 * 1024;
export const REDACTED_LOG_VALUE = '[REDACTED]';

export type SafeLogScalar = boolean | number | string | null;
export type SafeLogValue = SafeLogScalar | SafeLogValue[] | { [key: string]: SafeLogValue };
export type SafeLogRecord = Record<string, SafeLogValue>;

export interface BodyLogSnapshot {
  body?: string;
  bodyBytes?: number;
  bodyTruncated?: boolean;
  bodyType?: string;
}

export function sanitizeHeaders(source: HeadersInit | undefined): Record<string, string>;
export function sanitizeQuery(url: URL): SafeLogRecord;
export function createBodySnapshot(raw: string): Required<BodyLogSnapshot>;
export function createRequestBodySnapshot(body: BodyInit | null | undefined): BodyLogSnapshot;
```

实现必须：

```ts
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /(authorization|cookie|password|passwd|secret|credential|apikey|accesstoken|refreshtoken|phone|mobile|telephone|email|address|street|recipient|customername|fullname)/.test(normalized);
}

function maskFreeText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/tmcp_v1_[^\s."']+\.[^\s"']+/gi, '[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[REDACTED]');
}
```

JSON 文本先 `JSON.parse`，递归替换敏感 key 对应的值，再序列化；非 JSON 文本直接执行
`maskFreeText`。UTF-8 截断通过逐字符累加字节数实现，不能直接按 JavaScript code unit
切片。`createRequestBodySnapshot` 只展开 string 与 `URLSearchParams`；其他 body 返回空
`body` 和稳定的 `bodyType`（如 `FormData`、`ReadableStream` 或 `binary`），避免消费 stream
或 FormData。

- [ ] **Step 4: 运行脱敏单元测试并确认通过**

Run: `npx vitest run tests/unit/webapi-log-sanitizer.test.ts`

Expected: PASS，4 个测试通过，日志快照不含测试凭证或 PII。

- [ ] **Step 5: 提交脱敏模块**

```bash
git add src/security/webapi-log-sanitizer.ts tests/unit/webapi-log-sanitizer.test.ts
git commit -m "feat: 增加 WebApi 日志脱敏快照"
```

### Task 2: 在 BaseHttpClient 采集完整请求和响应诊断信息

**Files:**
- Modify: `src/api/http-client.ts`
- Modify: `tests/unit/webapi-error-mapping.test.ts`

- [ ] **Step 1: 写入失败测试，覆盖成功请求与 403 错误正文**

扩展 `TestHttpClient`，增加带 query 和 JSON body 的调用，并使用真实 `Response`：

```ts
async postDiagnosticBody(): Promise<JsonObject> {
  const response = await this.fetchImpl(this.createUrl('/test', {
    page: '2',
    email: 'buyer@example.com'
  }), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: 'case', password: 'plain-password' })
  });
  return this.readJson(response, 'TVCMall test request');
}
```

成功事件断言包含：

```ts
expect(events).toContainEqual(expect.objectContaining({
  outcome: 'success',
  webApiRequestQuery: { page: '2', email: '[REDACTED]' },
  webApiRequestHeaders: expect.objectContaining({
    authorization: '[REDACTED]',
    'content-type': 'application/json',
    'x-tvcmall-mcp-trace-id': expect.stringMatching(/^[0-9a-f-]{36}$/)
  }),
  webApiRequestBody: expect.stringContaining('"query":"case"'),
  webApiResponseHeaders: expect.objectContaining({ 'content-type': 'application/json' }),
  webApiResponseBody: expect.stringContaining('"ok":true'),
  webApiResponseBodyState: 'complete'
}));
expect(JSON.stringify(events)).not.toContain(pat);
expect(JSON.stringify(events)).not.toContain('buyer@example.com');
expect(JSON.stringify(events)).not.toContain('plain-password');
```

`403` 无 auth reason header 时返回：

```json
{"code":"ROUTE_NOT_ALLOWED","message":"method and route are not registered","password":"never-log-me"}
```

断言 event 保留 `code/message`、`authReasonState=missing`，但不含密码；捕获的
`WebApiRequestError` 仍不包含 response body。

- [ ] **Step 2: 运行 HTTP client 定向测试并确认缺少诊断字段而失败**

Run: `npx vitest run tests/unit/webapi-error-mapping.test.ts`

Expected: FAIL，事件缺少 `webApiRequest*` / `webApiResponse*` 字段，且当前 403 未读取正文。

- [ ] **Step 3: 扩展 typed event 和 tracked metadata**

在 `src/api/http-client.ts` 增加：

```ts
export type WebApiResponseBodyState = 'complete' | 'empty' | 'read_failed' | 'unavailable';

export interface WebApiRequestDiagnostics {
  webApiRequestBody?: string;
  webApiRequestBodyBytes?: number;
  webApiRequestBodyTruncated?: boolean;
  webApiRequestBodyType?: string;
  webApiRequestHeaders: Record<string, string>;
  webApiRequestQuery: SafeLogRecord;
}

export interface WebApiResponseDiagnostics {
  webApiResponseBody?: string;
  webApiResponseBodyBytes?: number;
  webApiResponseBodyState: WebApiResponseBodyState;
  webApiResponseBodyTruncated?: boolean;
  webApiResponseHeaders?: Record<string, string>;
}
```

`WebApiRequestCompletedEvent` 组合 request diagnostics，并可选组合 response diagnostics；
`WebApiFailureMetadata` 仍只保留现有安全摘要，绝不加入 body/headers/query。

- [ ] **Step 4: 在实际 fetch 参数确定后生成请求快照**

把 traced headers 保存到局部变量，确保日志记录的是实际发送 headers：

```ts
const headers = withTraceHeaders(input, init?.headers, metadata);
Object.assign(metadata, {
  webApiRequestHeaders: sanitizeHeaders(headers),
  webApiRequestQuery: sanitizeQuery(requestUrl(input)),
  ...prefixRequestBodySnapshot(createRequestBodySnapshot(init?.body))
});
const response = await fetchImpl(input, { ...init, headers, signal: controller.signal });
```

网络、超时和 caller cancellation 的 completion event 从 metadata 复制同一份请求快照，
响应 state 固定为 `unavailable`。

- [ ] **Step 5: 统一读取响应文本并保持状态映射**

用 `response.text()` 读取一次正文。成功响应从该字符串执行 `JSON.parse`；非 2xx 响应
只用于创建安全日志快照。核心分支必须等价于：

```ts
const responseHeaders = sanitizeHeaders(response.headers);
let rawBody: string;
try {
  rawBody = await response.text();
} catch {
  const diagnostics = {
    webApiResponseBodyState: 'read_failed' as const,
    webApiResponseHeaders: responseHeaders
  };
  if (!response.ok) {
    const code = webApiErrorCodeForStatus(response.status);
    const failure = createFailureMetadata(response, metadata);
    if (failure) this.emitFailure(failure, metadata, code, diagnostics);
    throw new WebApiRequestError(code, failure);
  }
  // 成功 status 的正文读取失败仍是 API_UNAVAILABLE/response_body。
}
```

非 2xx 有正文时，emit event 包含 `complete` 或 `empty`、body bytes 和截断状态；
`emitFailure` 从 tracked metadata 复制详细 request diagnostics 到 event，但返回的错误对象只携带
现有 `WebApiFailureMetadata`。删除 `cancelResponseBody`，因为错误正文现在需要安全读取。

- [ ] **Step 6: 隔离日志 callback 故障**

`emitRequestCompleted` 不允许 callback 破坏业务调用：

```ts
private emitRequestCompleted(event: WebApiRequestCompletedEvent): void {
  try {
    this.onWebApiRequestCompleted?.(event);
  } catch {
    // Observability must not alter the WebApi result or stable tool error mapping.
  }
}
```

增加测试：callback 抛错时成功 WebApi 调用仍返回业务对象；403 仍抛
`WebApiRequestError('PERMISSION_DENIED')`。

- [ ] **Step 7: 更新现有 timeout/body mock 并运行定向测试**

把仅实现 `json()` 的 fake response 改为实现 `text()`，保持 abort listener 与 timer 断言。

Run: `npx vitest run tests/unit/webapi-error-mapping.test.ts`

Expected: PASS，所有 BaseHttpClient 和 tool wrapper 测试通过；每个 fetch 恰好产生一条完成事件。

- [ ] **Step 8: 提交 HTTP client 采集逻辑**

```bash
git add src/api/http-client.ts tests/unit/webapi-error-mapping.test.ts
git commit -m "feat: 记录 WebApi 请求响应详情"
```

### Task 3: 输出结构化详细字段并验证日志安全性

**Files:**
- Modify: `src/logging/mcp-http-logger.ts`
- Modify: `tests/unit/mcp-http-logger.test.ts`

- [ ] **Step 1: 写入 logger 失败测试**

构造包含 query、headers 和 body 的 `WebApiRequestCompletedEvent`，断言 JSON 行保留嵌套
对象和正文：

```ts
expect(record).toMatchObject({
  event: 'mcp_webapi_request_completed',
  webApiRequestQuery: { page: '2' },
  webApiRequestHeaders: { authorization: '[REDACTED]' },
  webApiRequestBody: '{"query":"case"}',
  webApiResponseHeaders: { 'content-type': 'application/json' },
  webApiResponseBody: '{"code":"ROUTE_NOT_ALLOWED"}',
  webApiResponseBodyState: 'complete',
  webApiResponseBodyTruncated: false
});
```

再调用 `toolCompleted`，断言其记录不包含 `webApiRequestBody` 或
`webApiResponseBody`。

- [ ] **Step 2: 运行 logger 测试并确认因字段未输出而失败**

Run: `npx vitest run tests/unit/mcp-http-logger.test.ts`

Expected: FAIL，`mcp_webapi_request_completed` 缺少新字段。

- [ ] **Step 3: 扩展 logger details 类型并逐字段输出**

把内部 `write` 的 details 类型从仅 scalar 改为安全事件值：

```ts
function write(
  level: Exclude<TvcMallLogLevel, 'silent'>,
  event: string,
  details: Record<string, unknown>
): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel]) return;
  output.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details })}\n`);
}
```

`webApiRequestCompleted` 必须显式列出每个新 typed 字段，不能 spread 任意对象；
`toolCompleted` 保持当前字段列表。用 try/catch 包裹 `output.write`，避免日志 sink 异常改变
业务结果。

- [ ] **Step 4: 运行 logger 与 HTTP client 联合定向测试**

Run: `npx vitest run tests/unit/mcp-http-logger.test.ts tests/unit/webapi-error-mapping.test.ts tests/unit/webapi-log-sanitizer.test.ts`

Expected: PASS，三个测试文件全部通过，输出不含测试 PAT/PII。

- [ ] **Step 5: 提交 logger 改动**

```bash
git add src/logging/mcp-http-logger.ts tests/unit/mcp-http-logger.test.ts
git commit -m "feat: 输出 WebApi 详细诊断字段"
```

### Task 4: 更新运维和 API 契约文档

**Files:**
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `tvcmall-webapi mcp开发接入说明文档.md`

- [ ] **Step 1: 写入文档契约测试或更新既有 README 断言**

在 `tests/unit/remote-readme.test.ts` 增加断言：

```ts
expect(readme).toMatch(/mcp_webapi_request_completed/);
expect(readme).toMatch(/webApiResponseBody/);
expect(readme).toMatch(/16 KiB/);
expect(readme).toMatch(/\[REDACTED\]/);
expect(apiContract).toMatch(/webApiResponseBodyState/);
```

- [ ] **Step 2: 运行文档测试并确认因说明缺失而失败**

Run: `npx vitest run tests/unit/remote-readme.test.ts`

Expected: FAIL，README/API contract 尚未包含详细 body 字段及 16 KiB 上限。

- [ ] **Step 3: 更新三份文档**

文档必须明确：

- 默认 `info` 对每次 WebApi 请求输出一条详细完成事件。
- query、headers、request/response body 在强制脱敏后记录。
- PAT、API KEY、Authorization、Cookie、密码和 PII 永远不会输出原值。
- body 快照最大 16 KiB，并用 bytes/truncated/state 字段说明完整性。
- `403 authReasonState=missing` 时查看 `webApiResponseBody` 的安全错误信息；仍建议用 trace ID
  查询 WebApi/ApplicationServices 授权审计。
- `mcp_tool_completed` 只是摘要，详细 payload 只查 `mcp_webapi_request_completed`。

删除 README 和 API contract 中“绝不记录 query/body/header”这类已经过时的描述，替换为
“不记录原始未脱敏值”。

- [ ] **Step 4: 运行文档测试和格式检查**

Run: `npx vitest run tests/unit/remote-readme.test.ts && git diff --check`

Expected: PASS；`git diff --check` 无输出。

- [ ] **Step 5: 提交文档**

```bash
git add README.md docs/api-contract.md "tvcmall-webapi mcp开发接入说明文档.md" tests/unit/remote-readme.test.ts
git commit -m "docs: 说明 WebApi 详细诊断日志"
```

### Task 5: 全量回归与敏感信息审计

**Files:**
- Modify only if a regression test exposes a defect in files already listed above.

- [ ] **Step 1: 运行全量测试**

Run: `npm test`

Expected: PASS，全部测试文件通过且 0 failures。

- [ ] **Step 2: 运行类型检查和生产构建**

Run: `npm run typecheck && npm run build`

Expected: 两条命令退出码均为 0。

- [ ] **Step 3: 运行 diff 和敏感信息静态检查**

Run: `git diff --check`

Expected: 无输出。

Run: `rg -n "tmcp_v1_|Authorization|TVCMALL_API_KEY|Cookie|buyer@example.com|plain-password" src tests README.md docs --glob '!docs/superpowers/**'`

Expected: 只命中测试 fixture、安全规则、脱敏器和文档中的字段名/假值；逐条确认没有生产凭证，
没有任何断言允许未脱敏值进入完成日志。

- [ ] **Step 4: 核对工作区只包含预期用户改动**

Run: `git status --short --branch`

Expected: 功能提交均已完成；原有用户文件 `package.json` 和 `query.sh` 状态保持不变。
