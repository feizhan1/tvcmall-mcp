# WebApi 全量请求日志实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 远程 MCP 对每次下游 WebApi 业务请求输出安全、可关联且包含结果阶段的诊断事件。

**Architecture:** `BaseHttpClient` 保存开始时间和受控 metadata，并在每个终态调用窄类型回调。远程 HTTP server 将 `McpHttpLogger.webApiRequestCompleted` 注入真实业务 client；tool 日志继续保留摘要。未知授权原因只分类为 `unrecognized`，绝不序列化原值。

**Tech Stack:** Node.js 20、TypeScript、Vitest、Node 原生 fetch。

---

### Task 1: 产生一次性安全 WebApi 请求事件

**Files:**
- Modify: `src/api/http-client.ts`
- Modify: `tests/unit/webapi-error-mapping.test.ts`

- [ ] **Step 1: 先写失败测试**

为 `TestHttpClient` 增加 `onWebApiRequestCompleted` 记录数组。成功请求应断言：

```ts
expect(events).toContainEqual({
  outcome: 'success',
  traceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  webApiMethod: 'GET',
  normalizedRoute: 'test',
  webApiStatus: 200,
  webApiDurationMs: expect.any(Number)
});
```

再覆盖 403 白名单、403 缺失 header、403 未知 header、网络、超时、body read 和非对象 JSON。未知 header 测试必须断言事件为 `authReasonState: 'unrecognized'`，且 `JSON.stringify(event)` 不含原始 header 值、PAT 或上游 body。

- [ ] **Step 2: 确认测试为 RED**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts`

Expected: FAIL，因为 `HttpClientOptions` 尚无事件回调且当前不会产生每请求事件。

- [ ] **Step 3: 最小实现事件模型与终态发射**

在 `src/api/http-client.ts` 定义 `WebApiFailurePhase`（`caller_cancelled`、`http_response`、`invalid_json`、`network`、`response_body`、`timeout`）、`WebApiAuthReasonState`（`accepted`、`missing`、`unrecognized`）和窄类型 `WebApiRequestCompletedEvent`。在 fetch 前记录开始时间；在 fetch 抛出、非 2xx、JSON body 读取失败、非对象 JSON 和成功对象五类终态各发射一次。

事件仅包含 trace、method、normalized route、HTTP status、耗时、稳定错误码、阶段和授权分类。失败 body 保持取消且不读取；未知 header 只输出分类，不输出原值。

- [ ] **Step 4: 确认 GREEN**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交核心 client 改动**

```bash
git add src/api/http-client.ts tests/unit/webapi-error-mapping.test.ts
git commit -m 'feat: 记录 WebApi 请求结果'
```

### Task 2: 接入远程 HTTP logger

**Files:**
- Modify: `src/logging/mcp-http-logger.ts`
- Modify: `src/app/client-factory.ts`
- Modify: `src/server.ts`
- Modify: `tests/unit/mcp-http-logger.test.ts`
- Modify: `tests/unit/client-factory.test.ts`
- Modify: `tests/integration/mcp-stdio.test.ts`

- [ ] **Step 1: 先写失败测试**

为 logger 增加以下期望调用，并断言 JSON 行事件名、级别和安全字段：

```ts
logger.webApiRequestCompleted({
  outcome: 'error',
  errorCode: 'PERMISSION_DENIED',
  webApiFailurePhase: 'http_response',
  authReasonState: 'missing',
  webApiMethod: 'GET',
  normalizedRoute: 'api/v3/user/points/stat',
  webApiStatus: 403,
  traceId: '00000000-0000-4000-8000-000000000000',
  webApiDurationMs: 42
});
```

断言记录不含 `headers`、`metadata`、未知 header 原值、PAT 或 body。为 factory 断言带 logger 的真实 client 保留回调；stdio 集成测试仍断言 stderr 为空。

- [ ] **Step 2: 确认测试为 RED**

Run: `npm test -- tests/unit/mcp-http-logger.test.ts tests/unit/client-factory.test.ts tests/integration/mcp-stdio.test.ts`

Expected: FAIL，因为 logger 尚无 `webApiRequestCompleted` 且 factory 没有注入回调。

- [ ] **Step 3: 最小实现 logger 和注入**

在 `McpHttpLogger` 增加仅接收 `WebApiRequestCompletedEvent` 的 `webApiRequestCompleted` 方法。成功事件为 `info`；`http_response` 的 4xx 为 `warn`；其他 error 为 `error`。`createTvcMallClients` 接收可选 logger，只向真实 `BaseHttpClient` 派生 clients 传递绑定方法；`createTvcMallMcpServer` 将远程 session logger 传给 factory。未传 logger 的 stdio 路径不传回调。

- [ ] **Step 4: 确认 GREEN**

Run: `npm test -- tests/unit/mcp-http-logger.test.ts tests/unit/client-factory.test.ts tests/integration/mcp-stdio.test.ts && npm run typecheck`

Expected: PASS，stdio 无普通 stderr 日志。

- [ ] **Step 5: 提交 logger 改动**

```bash
git add src/logging/mcp-http-logger.ts src/app/client-factory.ts src/server.ts tests/unit/mcp-http-logger.test.ts tests/unit/client-factory.test.ts tests/integration/mcp-stdio.test.ts
git commit -m 'feat: 输出 WebApi 全量请求日志'
```

### Task 3: 更新运维文档并完成端到端验证

**Files:**
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `tvcmall-webapi mcp开发接入说明文档.md`

- [ ] **Step 1: 更新事件契约与排查说明**

说明 `mcp_webapi_request_completed` 为每个下游业务请求输出安全字段，列出成功、403 缺失/未知 header、超时的日志示例和 `authReasonState` 语义。明确日志仍不记录凭据、body、query 或原始 header，WebApi trace 契约不变。

- [ ] **Step 2: 全量自动验证**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: 全部通过。

- [ ] **Step 3: 临时 stub 端到端验证**

使用本地 HTTP stub 分别返回 200、403 无 header、403 未知 header、403 `scope_missing`。通过真实 `HttpPointsClient` 和 JSON logger 调用后，断言每次调用恰有一条 `mcp_webapi_request_completed`，阶段/状态正确且捕获 stderr 不含测试 PAT、`Authorization`、response body 和未知 header 原文。

- [ ] **Step 4: 提交文档**

```bash
git add README.md docs/api-contract.md 'tvcmall-webapi mcp开发接入说明文档.md'
git commit -m 'docs: 说明 WebApi 全量请求日志'
```
