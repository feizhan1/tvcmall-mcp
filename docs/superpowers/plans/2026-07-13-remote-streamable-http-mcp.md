# Remote Streamable HTTP MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TVCMall MCP 从本地 stdio/登录模型迁移为由 API Key 鉴权的远程 Streamable HTTP 服务。

**Architecture:** Node HTTP server 在 `/mcp` 使用 MCP SDK 的 stateful `StreamableHTTPServerTransport`。初始化请求经 API Key 验证接口换取短期业务 token，并创建独立 MCP server；后续请求必须匹配该 session 的 API Key 指纹。订单导出保存于服务端临时目录，经重新鉴权的下载端点交付。

**Tech Stack:** Node.js 20、TypeScript、`@modelcontextprotocol/sdk`、Node `http`/`crypto`/`fs`、Zod、Vitest。

---

### Task 1: API Key 认证模型与配置

**Files:**
- Create: `src/auth/api-key-verifier.ts`
- Create: `src/auth/request-auth-context.ts`
- Modify: `src/config/runtime-config.ts`
- Modify: `src/api/http-client.ts`
- Test: `tests/unit/api-key-verifier.test.ts`
- Test: `tests/unit/runtime-config.test.ts`

- [ ] **Step 1: 写验证器的失败测试**

```ts
it('uses a Bearer API key and maps a complete verification response', async () => {
  const verifier = new HttpApiKeyVerifier({ verifyUrl: 'https://auth.test/verify', fetch: fetchMock });
  await expect(verifier.verify('user-api-key')).resolves.toMatchObject({
    customerId: 'customer_123', scopes: ['orders:read'], upstreamAccessToken: 'short-token'
  });
  expect(fetchMock).toHaveBeenCalledWith('https://auth.test/verify', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer user-api-key' })
  }));
});
```

- [ ] **Step 2: 运行失败测试确认实现缺失**

Run: `npm test -- tests/unit/api-key-verifier.test.ts`

Expected: FAIL，提示 `HttpApiKeyVerifier` 模块尚不存在。

- [ ] **Step 3: 最小化实现验证器与认证上下文**

```ts
export interface RequestAuthContext {
  customerId: string;
  displayName: string;
  scopes: string[];
  upstreamAccessToken: string;
  expiresAt: string;
  apiKeyFingerprint: string;
}
```

`HttpApiKeyVerifier` 以 `POST` 调用 `TVCMALL_API_KEY_VERIFY_URL`，校验必填响应字段与有效期。`401`/`403` 产生 `InvalidApiKeyError`；超时、`5xx` 或无效 JSON 产生 `ApiKeyVerificationUnavailableError`。SHA-256 指纹仅保存在内存并用于同一 session 的 API Key 匹配。

- [ ] **Step 4: 扩展配置和下游请求头**

增加 `mcpHost`、`mcpPort`、`mcpPath`、`apiKeyVerifyUrl`、`apiKeyVerifyTimeoutMs` 和 `exportTtlMs`；将下游 client 的 header 固定为 `Authorization: Bearer <upstreamAccessToken>`。

- [ ] **Step 5: 运行认证与配置测试**

Run: `npm test -- tests/unit/api-key-verifier.test.ts tests/unit/runtime-config.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/auth/api-key-verifier.ts src/auth/request-auth-context.ts src/config/runtime-config.ts src/api/http-client.ts tests/unit/api-key-verifier.test.ts tests/unit/runtime-config.test.ts
git commit -m "feat: 支持远程 MCP API Key 验证"
```

### Task 2: 请求级工具身份与权限

**Files:**
- Modify: `src/app/register-tools.ts`
- Modify: `src/tools/auth-status.ts`
- Modify: `src/tools/products.ts`
- Modify: `src/tools/points.ts`
- Modify: `src/tools/shipping.ts`
- Modify: `src/tools/orders.ts`
- Modify: `src/tools/tracking.ts`
- Modify: `src/tools/export-orders.ts`
- Modify: `src/errors/mcp-errors.ts`
- Test: `tests/unit/*-tool*.test.ts`

- [ ] **Step 1: 写请求级短期 token 的失败测试**

```ts
it('passes the request-scoped upstream token to the order client', async () => {
  await listOrdersForMcp({}, { authContext, orderClient });
  expect(orderClient.session?.accessToken).toBe('short-token');
});
```

- [ ] **Step 2: 运行失败测试确认旧依赖不满足需求**

Run: `npm test -- tests/unit/orders-tools.test.ts`

Expected: FAIL，因为 tool 尚未接受 `authContext`。

- [ ] **Step 3: 用 `RequestAuthContext` 替换 tool 的本地会话读取**

每个 tool 依赖 `authContext`，并由单一适配器构建业务 client 所需的临时 session：

```ts
const session = {
  customer: { id: authContext.customerId, email: '', name: authContext.displayName },
  scopes: authContext.scopes,
  accessToken: authContext.upstreamAccessToken,
  expiresAt: authContext.expiresAt
};
```

删除各 tool 对 `getActiveSession`、`AuthClient` 与持久化 `TokenStore` 的运行时调用。认证状态只返回连接状态、显示名和 scopes。

- [ ] **Step 4: 增加 scope 校验并改正认证错误**

为商品、积分、运费、订单、物流和导出声明 read/export scope。scope 缺失返回 `PERMISSION_DENIED`，不调用下游 client；缺失身份错误固定为 `AUTH_REQUIRED: 缺少或无效的 TVCMall API Key`。

- [ ] **Step 5: 运行所有 tools 单测**

Run: `npm test -- tests/unit/auth-status.test.ts tests/unit/search-products-tool.test.ts tests/unit/product-detail-tool.test.ts tests/unit/orders-tools.test.ts tests/unit/points-tools.test.ts tests/unit/shipping-estimate-tool.test.ts tests/unit/tracking-tools.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/app/register-tools.ts src/tools src/errors/mcp-errors.ts tests/unit
git commit -m "feat: 让 MCP tools 使用请求级身份"
```

### Task 3: Streamable HTTP 服务与会话隔离

**Files:**
- Create: `src/http/mcp-http-server.ts`
- Create: `src/http/http-errors.ts`
- Create: `src/http/request-body.ts`
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Test: `tests/unit/mcp-http-server.test.ts`
- Test: `tests/integration/mcp-streamable-http.test.ts`

- [ ] **Step 1: 写未带 API Key 的 HTTP 集成失败测试**

```ts
it('returns 401 before accepting an unauthenticated initialize request', async () => {
  const response = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: jsonHeaders, body: initializeBody });
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain('test-api-key');
});
```

- [ ] **Step 2: 运行测试确认远程端点尚不存在**

Run: `npm test -- tests/integration/mcp-streamable-http.test.ts`

Expected: FAIL，提示远程 server 入口不存在或连接失败。

- [ ] **Step 3: 实现 stateful Streamable HTTP 路由**

`createMcpHttpServer` 只处理 MCP 路径、`GET /healthz` 和导出下载路径。新 `initialize` 请求验证 Bearer API Key，创建 `McpServer`、`StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID })` 和认证上下文。现有 session 的 `GET`、`POST`、`DELETE` 必须携带同一 API Key 指纹才委派给 transport；`onclose` 删除 session 与上下文。

- [ ] **Step 4: 实现安全 HTTP 错误和协议集成测试**

```ts
function sendHttpError(res: ServerResponse, status: 400 | 401 | 503, code: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code } }));
}
```

集成测试通过 `StreamableHTTPClientTransport` 的 `requestInit.headers.Authorization` 验证 `initialize`、`tools/list`、受授权 `tools/call`、跨 Key session 拒绝、验证服务 `5xx` 返回 `503` 和无需认证的 `/healthz`。

- [ ] **Step 5: 运行 HTTP 测试**

Run: `npm test -- tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/http src/server.ts src/index.ts package.json tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts
git commit -m "feat: 提供 Streamable HTTP MCP 服务"
```

### Task 4: 远程订单导出与受保护下载

**Files:**
- Create: `src/export/export-store.ts`
- Modify: `src/export/csv-exporter.ts`
- Modify: `src/tools/export-orders.ts`
- Modify: `src/http/mcp-http-server.ts`
- Test: `tests/unit/export-store.test.ts`
- Test: `tests/unit/export-orders-tool.test.ts`
- Test: `tests/integration/mcp-streamable-http.test.ts`

- [ ] **Step 1: 写所有权检查的失败测试**

```ts
it('does not return an export belonging to another customer', async () => {
  expect(await store.open('export_123', 'customer_b')).toBeNull();
});
```

- [ ] **Step 2: 运行失败测试确认存储实现缺失**

Run: `npm test -- tests/unit/export-store.test.ts`

Expected: FAIL，提示 `ExportStore` 模块不存在。

- [ ] **Step 3: 实现 TTL 导出存储与下载端点**

`ExportStore` 使用高熵 ID 和 `open(..., 'wx')` 保证不覆盖；仅在服务端保存 customer ID、文件名、格式、路径和到期时间。tool 返回 `download_url`、`expires_at`、格式、数量和筛选摘要；下载端点重新验证 API Key 与 customer ID，永不回显路径。

- [ ] **Step 4: 运行导出测试**

Run: `npm test -- tests/unit/export-store.test.ts tests/unit/export-orders-tool.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: PASS；其他客户或过期导出均不可下载。

- [ ] **Step 5: Commit**

```bash
git add src/export src/tools/export-orders.ts src/http/mcp-http-server.ts tests/unit/export-store.test.ts tests/unit/export-orders-tool.test.ts tests/integration/mcp-streamable-http.test.ts
git commit -m "feat: 支持远程受保护订单导出"
```

### Task 5: 删除本地模式并更新公开契约

**Files:**
- Delete: `src/cli/`
- Delete: `src/auth/auth-client.ts`
- Delete: `src/auth/fake-auth-client.ts`
- Delete: `src/auth/http-auth-client.ts`
- Delete: `src/auth/session-manager.ts`
- Delete: `src/storage/`
- Delete: `src/harness/`
- Delete: `tests/integration/mcp-stdio.test.ts`
- Delete: `tests/unit/auth-session.test.ts`
- Delete: `tests/unit/cli*.test.ts`
- Delete: `tests/unit/fake-auth-client.test.ts`
- Delete: `tests/unit/http-auth-client.test.ts`
- Delete: `tests/unit/keychain-token-store.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/harness.md`
- Test: `tests/unit/remote-readme.test.ts`

- [ ] **Step 1: 写远程配置文档的失败检查**

```ts
it('documents only remote URL and Authorization configuration', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('"url": "https://mcp.tvcmall.com/mcp"');
  expect(readme).not.toContain('npx @tvcmall/mcp login');
});
```

- [ ] **Step 2: 运行检查确认旧说明存在**

Run: `npm test -- tests/unit/remote-readme.test.ts`

Expected: FAIL，README 仍包含本地登录。

- [ ] **Step 3: 删除本地代码、依赖和测试**

删除 CLI、Keychain、stdio harness 与相关测试；从 `package.json` 删除 `bin`、`commander` 与 `keytar`，新增 `start: node dist/index.js`。保留 fake 业务 clients 作为远程服务测试依赖。

- [ ] **Step 4: 更新 README、MVP、API 契约和 harness 文档**

文档全部改为远程 Streamable HTTP、API Key、验证接口、受保护远程导出、TLS 与日志脱敏；删除本地安装、CLI 登录、Keychain、stdio stdout 和本地文件路径说明。

- [ ] **Step 5: 运行完整验证**

Run: `npm test && npm run typecheck && npm run build && npm pack --dry-run`

Expected: 所有测试、类型检查和构建通过，产物不包含本地 CLI/Keychain 入口。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: 移除本地 stdio MCP 模式"
```
