# WebApi PAT Authorization Implementation Plan

> 状态：历史归档。本文对应的 WebApi PAT 改造已经执行完成，客户端入站 Header 已由 `docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md` 取代；本文不得作为当前实施入口。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将远程 Streamable HTTP MCP 改为接收 `tmcp_v1_` PAT，并把同一 PAT 直接传给现有 TVCMall WebApi。

**Architecture:** MCP HTTP 层只验证 Bearer PAT 基本格式并把 PAT 指纹绑定到 session；不调用独立认证服务。Tools 使用 session 中的 PAT 调用现有 WebApi，WebApi 负责 PAT、`catalog.read`/`order.read` 和 route allowlist 授权。

**Tech Stack:** Node.js 20、TypeScript、`@modelcontextprotocol/sdk`、Zod、Vitest。

---

### Task 1: PAT 认证上下文

**Files:**
- Modify: `src/auth/request-auth-context.ts`
- Delete: `src/auth/api-key-verifier.ts`
- Delete: `tests/unit/api-key-verifier.test.ts`
- Test: `tests/unit/request-auth-context.test.ts`

- [ ] **Step 1: 写 PAT 格式和 session 适配失败测试**

```ts
it('creates a request context from a valid MCP PAT', () => {
  const context = createPatAuthContext('tmcp_v1_token-id.secret-value');
  expect(context.pat).toBe('tmcp_v1_token-id.secret-value');
  expect(context.patFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(toStoredAuthSession(context).accessToken).toBe(context.pat);
});

it.each(['', 'website-token', 'tmcp_v1_missing-secret.'])('rejects invalid PAT %s', (pat) => {
  expect(() => createPatAuthContext(pat)).toThrow('AUTH_REQUIRED');
});
```

- [ ] **Step 2: 运行测试确认旧上下文不支持 PAT**

Run: `npm test -- tests/unit/request-auth-context.test.ts`

Expected: FAIL，`createPatAuthContext` 尚不存在。

- [ ] **Step 3: 实现最小 PAT 上下文**

```ts
export interface RequestAuthContext {
  pat: string;
  patFingerprint: string;
}
```

`createPatAuthContext` trim 后校验 `tmcp_v1_{tokenId}.{secret}` 的两段均非空且不含空白；`toStoredAuthSession` 仅为现有业务 client 提供 `accessToken: pat`，不创建用户、scope 或过期时间语义。

- [ ] **Step 4: 删除验证器并运行测试**

Run: `npm test -- tests/unit/request-auth-context.test.ts && npm run typecheck`

Expected: PAT 上下文测试通过；类型检查只暴露后续任务尚未迁移的引用。

### Task 2: Streamable HTTP session 直接接收 PAT

**Files:**
- Modify: `src/http/mcp-http-server.ts`
- Modify: `src/index.ts`
- Modify: `tests/integration/mcp-streamable-http.test.ts`
- Modify: `tests/unit/mcp-http-server.test.ts`

- [ ] **Step 1: 写初始化和 session PAT 绑定失败测试**

```ts
it.each(['Bearer website-token', 'Basic tmcp_v1_id.secret'])('rejects invalid authorization %s', async (authorization) => {
  const response = await initialize({ authorization });
  expect(response.status).toBe(401);
});

it('rejects replacing the PAT on an existing session', async () => {
  const sessionId = await initializeWithPat('tmcp_v1_first.secret');
  const response = await listTools(sessionId, 'tmcp_v1_second.secret');
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: 运行测试确认服务器仍依赖验证器**

Run: `npm test -- tests/integration/mcp-streamable-http.test.ts tests/unit/mcp-http-server.test.ts`

Expected: FAIL，server options 仍要求 `apiKeyVerifier`。

- [ ] **Step 3: 删除验证调用并绑定 PAT 指纹**

`createMcpHttpServer` 不再接受 `apiKeyVerifier`。初始化时使用 `createPatAuthContext`，session 保存 `patFingerprint`；后续 `POST`、`GET`、`DELETE` 必须携带同一 PAT。`src/index.ts` 直接按 host、port、path 启动，不构造验证器。

- [ ] **Step 4: 运行 HTTP 测试**

Run: `npm test -- tests/integration/mcp-streamable-http.test.ts tests/unit/mcp-http-server.test.ts`

Expected: 缺失/错误 PAT 为 `401`，有效 PAT 可初始化，替换 PAT 被拒绝。

### Task 3: WebApi 配置与 PAT 请求头

**Files:**
- Modify: `src/config/runtime-config.ts`
- Modify: `src/app/client-factory.ts`
- Modify: `src/api/http-client.ts`
- Modify: `tests/unit/runtime-config.test.ts`
- Modify: `tests/unit/client-factory.test.ts`
- Modify: `tests/unit/http-product-client.test.ts`
- Modify: `tests/unit/http-order-client.test.ts`
- Modify: `tests/unit/http-points-client.test.ts`
- Modify: `tests/unit/http-shipping-client.test.ts`
- Modify: `tests/unit/http-tracking-client.test.ts`

- [ ] **Step 1: 写 WebApi URL 与 PAT 透传失败测试**

```ts
expect(loadRuntimeConfig({ TVCMALL_WEBAPI_BASE_URL: 'https://webapi.test' }).webApiBaseUrl)
  .toBe('https://webapi.test');
expect(request.headers.Authorization).toBe('Bearer tmcp_v1_token-id.secret-value');
```

- [ ] **Step 2: 运行配置和 HTTP client 测试确认旧字段仍存在**

Run: `npm test -- tests/unit/runtime-config.test.ts tests/unit/client-factory.test.ts tests/unit/http-product-client.test.ts`

Expected: FAIL，配置仍使用 `apiBaseUrl` 和独立验证 URL。

- [ ] **Step 3: 修改配置与 client factory**

运行时配置使用 `webApiBaseUrl` 和 `TVCMALL_WEBAPI_BASE_URL`；删除旧验证服务的 URL、timeout 与不安全开发开关。真实 clients 全部使用 WebApi base URL。`BaseHttpClient` 保持单次 `Bearer` 前缀，拒绝空 PAT。

- [ ] **Step 4: 运行所有真实 client 测试**

Run: `npm test -- tests/unit/runtime-config.test.ts tests/unit/client-factory.test.ts tests/unit/http-product-client.test.ts tests/unit/http-order-client.test.ts tests/unit/http-points-client.test.ts tests/unit/http-shipping-client.test.ts tests/unit/http-tracking-client.test.ts`

Expected: 所有请求把相同 PAT 发送到现有 WebApi route。

### Task 4: 删除 tool 本地 scope 判断并映射 WebApi 错误

**Files:**
- Modify: `src/tools/auth-status.ts`
- Modify: `src/tools/products.ts`
- Modify: `src/tools/orders.ts`
- Modify: `src/tools/points.ts`
- Modify: `src/tools/shipping.ts`
- Modify: `src/tools/tracking.ts`
- Modify: `src/errors/mcp-errors.ts`
- Modify: `src/api/http-client.ts`
- Modify: `src/app/register-tools.ts`
- Test: `tests/unit/auth-status.test.ts`
- Test: `tests/unit/search-products-tool.test.ts`
- Test: `tests/unit/orders-tools.test.ts`
- Test: `tests/unit/points-tools.test.ts`
- Test: `tests/unit/shipping-estimate-tool.test.ts`
- Test: `tests/unit/tracking-tools.test.ts`

- [ ] **Step 1: 写无本地 scope 和错误映射失败测试**

```ts
it('calls the product client without a local scope list', async () => {
  await searchProductsForMcp(input, { authContext, productClient });
  expect(productClient.searchProducts).toHaveBeenCalled();
});

it('reports only whether PAT is configured', () => {
  expect(getAuthStatus(authContext)).toEqual({ configured: true });
});
```

- [ ] **Step 2: 运行 tool 测试确认本地 scope 仍拒绝调用**

Run: `npm test -- tests/unit/auth-status.test.ts tests/unit/search-products-tool.test.ts tests/unit/orders-tools.test.ts`

Expected: FAIL，旧代码仍读取 `session.scopes`。

- [ ] **Step 3: 删除本地 scope 判断并添加稳定错误转换**

所有 tool 只检查 PAT context 是否存在，不检查 scope。`BaseHttpClient` 对 `401`、`403`、`429` 和其他非成功响应抛出稳定 typed error；tool 注册层使用统一 wrapper 映射为 `AUTH_REQUIRED`、`PERMISSION_DENIED`、`RATE_LIMITED` 和 `API_UNAVAILABLE`，不包含 WebApi 响应正文。

- [ ] **Step 4: 运行所有 tool 测试**

Run: `npm test -- tests/unit/auth-status.test.ts tests/unit/search-products-tool.test.ts tests/unit/product-detail-tool.test.ts tests/unit/orders-tools.test.ts tests/unit/points-tools.test.ts tests/unit/shipping-estimate-tool.test.ts tests/unit/tracking-tools.test.ts`

Expected: 无本地 scope 提前拒绝；认证状态只返回 configured。

### Task 5: 更新授权文档并完整验证

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/harness.md`
- Modify: `docs/remote-streamable-http-mcp-architecture.md`
- Modify: `docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md`
- Modify: `docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md`
- Modify: `docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md`
- Test: `tests/unit/remote-readme.test.ts`（如存在）
- Track unchanged authority: `tvcmall-webapi mcp开发接入说明文档.md`

- [ ] **Step 1: 写或更新文档契约检查**

```ts
expect(projectDocs).toContain('tmcp_v1_{tokenId}.{secret}');
expect(projectDocs).not.toContain(`TVCMALL_API_KEY_${'VERIFY_URL'}`);
expect(projectDocs).not.toContain(`upstream${'AccessToken'}`);
```

- [ ] **Step 2: 运行检查确认旧授权文案存在**

Run: `npm test -- tests/unit/remote-readme.test.ts`

Expected: FAIL；若文件不存在，使用后续 `rg` 残留检查作为红灯证据。

- [ ] **Step 3: 将公开文档统一为 PAT 直连 WebApi**

删除独立验证服务、短期 token、用户名密码登录、本地 scope 判断和旧 API Key 字段。记录 PAT 格式、现有 route、`catalog.read`/`order.read`、WebApi 错误映射和安全要求。

- [ ] **Step 4: 完整验证**

Run: 将旧验证 URL、短期 token、HTTP verifier 与旧验证字段名拆分为 shell 变量后执行 `rg -n "$legacy_verify_url|$short_token|$http_verifier|$verify_field" src tests README.md docs`，再运行 `npm test && npm run typecheck && npm run build && git diff --check`。拆分变量可避免计划本身重新引入已禁止的精确旧标识。

Expected: 残留搜索无匹配；测试、类型检查、构建和 diff 检查全部通过。

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md docs/api-contract.md docs/harness.md docs/mvp-scope.md \
  docs/remote-streamable-http-mcp-architecture.md \
  docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md \
  docs/superpowers/plans/2026-07-20-webapi-pat-auth.md \
  docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md \
  docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md \
  tests/unit/remote-readme.test.ts 'tvcmall-webapi mcp开发接入说明文档.md'
git commit -m "refactor: 对齐 WebApi PAT 授权"
```
