# TVCMALL_API_KEY Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将远程 Streamable HTTP MCP 入站认证从 `Authorization: Bearer <PAT>` 破坏性切换为每请求 `TVCMALL_API_KEY: <PAT>`，同时保留 MCP Server 到现有 TVCMall WebApi 的 Bearer PAT 调用。

**Architecture:** `src/http/mcp-http-server.ts` 是唯一入站 Header 边界：拒绝任何入站 `Authorization`，读取原始 `TVCMALL_API_KEY` 并继续复用 PAT 格式校验和 session SHA-256 指纹绑定。领域 HTTP clients 不改变，仍从 session 取得同一 PAT 并向现有 WebApi 发送 `Authorization: Bearer <PAT>`；WebApi、ApplicationServices、RDS 均为外部现有系统，本仓库不实现。

**Tech Stack:** Node.js 20+、TypeScript、`@modelcontextprotocol/sdk` Streamable HTTP、Vitest、Markdown/Mermaid。

---

## 文件职责

- `src/http/mcp-http-server.ts`：读取并约束 MCP 入站 Header，管理 PAT session 生命周期。
- `tests/unit/mcp-http-server.test.ts`：无真实端口的入站 Header、session 与泄漏回归。
- `tests/integration/mcp-streamable-http.test.ts`：真实 Node HTTP 端口上的 Streamable HTTP Header 和 session 契约。
- `src/cli/app.ts`、`src/cli/messages.ts`：历史 CLI 仅输出新的远程客户端配置说明。
- `src/app/register-tools.ts`：对 MCP Client 发布真实 WebApi 只读 tool metadata。
- `src/errors/mcp-errors.ts`：只保留实际稳定使用的 tool 错误码。
- `tests/unit/remote-readme.test.ts`：约束权威接入说明与当前公开文档的两段 Header 边界。
- `tvcmall-webapi mcp开发接入说明文档.md`：权威说明 Client -> MCP 与 MCP -> WebApi 的不同 Header。
- `README.md`、`AGENTS.md`、`docs/api-contract.md`、`docs/mvp-scope.md`、`docs/harness.md`、`docs/remote-streamable-http-mcp-architecture.md`：当前公开契约与架构。
- `docs/superpowers/specs/*`、`docs/superpowers/plans/*`：新设计作为当前入口，旧方案明确归档。

### Task 1: 以失败测试锁定新的入站 Header 契约

**Files:**
- Modify: `tests/unit/mcp-http-server.test.ts`
- Modify: `tests/integration/mcp-streamable-http.test.ts`

- [ ] **Step 1: 将 unit dispatch API 改为原始 API KEY，并保留 legacy Authorization 注入能力**

```ts
interface DispatchOptions {
  server?: ReturnType<typeof createMcpHttpServer>;
  method: string;
  apiKey?: string;
  authorization?: string;
  body?: unknown;
  path?: string;
  sessionId?: string;
}

headers: {
  ...(options.apiKey !== undefined ? { tvcmall_api_key: options.apiKey } : {}),
  ...(options.authorization !== undefined ? { authorization: options.authorization } : {}),
  ...(options.sessionId ? { 'mcp-session-id': options.sessionId } : {})
}
```

- [ ] **Step 2: 把成功和 session 测试改为发送原始 PAT，并新增旧 Header/双 Header 拒绝断言**

```ts
it.each([
  ['missing API KEY', undefined],
  ['Bearer-prefixed API KEY', 'Bearer tmcp_v1_token-id.secret-value'],
  ['website token', 'website-token'],
  ['invalid tmcp format', 'tmcp_v1_missing-secret.']
])('rejects %s without exposing the credential', async (_label, apiKey) => {
  const response = await dispatch({ method: 'POST', apiKey, body: initializeRequest() });
  expect(response.status).toBe(401);
  expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
  if (apiKey) expect(response.body).not.toContain(apiKey);
});

it('rejects the removed Authorization input even when its PAT is valid', async () => {
  const response = await dispatch({
    method: 'POST',
    authorization: 'Bearer tmcp_v1_legacy.secret-value',
    body: initializeRequest()
  });
  expect(response.status).toBe(401);
});

it('rejects ambiguous requests carrying both credential headers', async () => {
  const response = await dispatch({
    method: 'POST',
    apiKey: 'tmcp_v1_current.secret-value',
    authorization: 'Bearer tmcp_v1_legacy.secret-value',
    body: initializeRequest()
  });
  expect(response.status).toBe(401);
});
```

所有现有成功请求和 `initialize()` helper 都将 `authorization: Bearer ${pat}` 改为 `apiKey: pat`；后续 `POST`、`GET`、`DELETE` 继续验证缺失或替换 PAT 时的 `401`。

- [ ] **Step 3: 将真实端口 integration helper 改为 `TVCMALL_API_KEY`，并覆盖 legacy/双 Header 拒绝**

```ts
function initialize(baseUrl: string, apiKey?: string, authorization?: string): Promise<Response> {
  return fetch(baseUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(apiKey !== undefined ? { TVCMALL_API_KEY: apiKey } : {}),
      ...(authorization !== undefined ? { authorization } : {})
    },
    body: JSON.stringify(initializeBody())
  });
}

function requestHeaders(pat: string | undefined, sessionId: string): Record<string, string> {
  return {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-session-id': sessionId,
    ...(pat !== undefined ? { TVCMALL_API_KEY: pat } : {})
  };
}
```

- [ ] **Step 4: 运行定向测试并确认 RED 原因是服务端仍读取 Authorization**

Run:

```bash
npm test -- tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts
```

Expected: 新的有效 `TVCMALL_API_KEY` initialize 得到 `401`，legacy Authorization 拒绝测试得到旧实现的 `200`。

### Task 2: 最小实现 `TVCMALL_API_KEY` 入站认证

**Files:**
- Modify: `src/http/mcp-http-server.ts`
- Test: `tests/unit/mcp-http-server.test.ts`
- Test: `tests/integration/mcp-streamable-http.test.ts`

- [ ] **Step 1: 用严格 API KEY reader 替换 Bearer reader**

```ts
function readTvcMallApiKey(req: IncomingMessage): string | undefined {
  if (req.headers.authorization !== undefined) return undefined;
  const apiKey = req.headers['tvcmall_api_key'];
  if (typeof apiKey !== 'string') return undefined;
  const pat = apiKey.trim();
  return pat || undefined;
}
```

请求处理器改为：

```ts
const pat = readTvcMallApiKey(req);
if (!pat) {
  sendHttpError(res, 401, 'AUTH_REQUIRED');
  return;
}
```

PAT 格式仍由 `createPatAuthContext()` 校验；包含逗号的重复 Header 合并值、带 `Bearer ` 的值、空值和带空白 token 都会被拒绝。

- [ ] **Step 2: 运行 unit 与真实端口 integration 并确认 GREEN**

Run:

```bash
npm test -- tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts
```

Expected: 两个测试文件全部通过，响应正文不包含任一测试 PAT。

- [ ] **Step 3: 提交入站认证切换**

```bash
git add src/http/mcp-http-server.ts tests/unit/mcp-http-server.test.ts tests/integration/mcp-streamable-http.test.ts
git commit -m "feat: require TVCMALL_API_KEY for remote MCP"
```

### Task 3: 更新 CLI 配置指导

**Files:**
- Modify: `tests/unit/cli.test.ts`
- Modify: `tests/unit/cli-login.test.ts`
- Modify: `tests/unit/cli-logout.test.ts`
- Modify: `src/cli/messages.ts`
- Modify: `src/cli/app.ts`

- [ ] **Step 1: 先把断言改为新的 Header 文案**

```ts
expect(stdout.value).toContain('TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}');
expect(stdout.value).not.toContain('Authorization: Bearer tmcp_v1_');
```

logout 断言使用：

```ts
expect(stdout.value).toContain('移除 TVCMALL_API_KEY Header');
```

- [ ] **Step 2: 运行 CLI 测试并确认 RED**

Run:

```bash
npm test -- tests/unit/cli.test.ts tests/unit/cli-login.test.ts tests/unit/cli-logout.test.ts
```

Expected: FAIL，实际文案仍提示入站 `Authorization: Bearer`。

- [ ] **Step 3: 最小修改 CLI 输出**

`src/cli/messages.ts` 和 `src/cli/app.ts` 统一输出：

```text
TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}
```

logout 使用：

```text
如需停用远程 PAT，请从 MCP Client 的远程 MCP 配置中移除 TVCMALL_API_KEY Header。
```

- [ ] **Step 4: 运行 CLI 测试并确认 GREEN**

Run:

```bash
npm test -- tests/unit/cli.test.ts tests/unit/cli-login.test.ts tests/unit/cli-logout.test.ts
```

Expected: 三个测试文件全部通过，输出不含 PAT 实值。

- [ ] **Step 5: 提交 CLI 指导**

```bash
git add src/cli/app.ts src/cli/messages.ts tests/unit/cli.test.ts tests/unit/cli-login.test.ts tests/unit/cli-logout.test.ts
git commit -m "docs: update CLI API key guidance"
```

### Task 4: 清理错误码与 tool metadata 漂移

**Files:**
- Modify: `tests/unit/server.test.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `src/errors/mcp-errors.ts`

- [ ] **Step 1: 添加失败断言**

```ts
import { MCP_ERROR_MESSAGES } from '../../src/errors/mcp-errors.js';

it('publishes real read-only WebApi tool descriptions', () => {
  const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
  const tools = (server as unknown as {
    _registeredTools: Record<string, { description?: string }>;
  })._registeredTools;

  expect(tools.tvcmall_search_products.description).toContain('只读');
  expect(tools.tvcmall_get_product_detail.description).toContain('只读');
  expect(tools.tvcmall_list_orders.description).toContain('只读');
  expect(JSON.stringify(tools)).not.toContain('使用假数据');
});

it('does not expose the removed project validation error code', () => {
  expect(MCP_ERROR_MESSAGES).not.toHaveProperty(['VALIDATION', 'ERROR'].join('_'));
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
npm test -- tests/unit/server.test.ts
```

Expected: FAIL，三个 description 仍声明假数据，且错误对象仍包含已废弃 validation code。

- [ ] **Step 3: 修改 metadata 并删除未使用错误码**

三个 description 分别改为：

```ts
'通过 TVCMall WebApi 只读搜索商品'
'通过 TVCMall WebApi 只读查询商品详情'
'通过 TVCMall WebApi 只读查询订单列表'
```

从 `MCP_ERROR_MESSAGES` 删除未使用的 `VALIDATION_ERROR`；输入 schema 继续由 MCP SDK 返回 JSON-RPC `Invalid params (-32602)`。

- [ ] **Step 4: 运行测试并确认 GREEN，然后提交**

Run:

```bash
npm test -- tests/unit/server.test.ts
```

Expected: PASS。

```bash
git add src/app/register-tools.ts src/errors/mcp-errors.ts tests/unit/server.test.ts
git commit -m "fix: align tool metadata with WebApi runtime"
```

### Task 5: 用契约测试锁定文档的两段 Header 边界

**Files:**
- Modify: `tests/unit/remote-readme.test.ts`

- [ ] **Step 1: 将权威接入说明和新设计纳入当前文档集合**

```ts
const authorityDoc = readFileSync('tvcmall-webapi mcp开发接入说明文档.md', 'utf8');
const currentHeaderDesign = readFileSync(
  'docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md',
  'utf8'
);

const currentDocs = readDocs([
  'README.md',
  'AGENTS.md',
  'docs/api-contract.md',
  'docs/mvp-scope.md',
  'docs/harness.md',
  'docs/remote-streamable-http-mcp-architecture.md',
  'docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md',
  'tvcmall-webapi mcp开发接入说明文档.md'
]);
```

- [ ] **Step 2: 添加当前契约与历史归档断言**

```ts
it('separates inbound API KEY from outbound WebApi Authorization', () => {
  for (const document of [readme, apiContract, architecture, authorityDoc]) {
    expect(document).toContain('TVCMALL_API_KEY');
    expect(document).toContain('Authorization: Bearer');
    expect(document).toContain('tmcp_v1_{tokenId}.{secret}');
  }
  expect(authorityDoc).not.toContain('process.env.TVCMALL_MCP_PAT');
  expect(currentDocs).not.toContain('Bearer ${TVCMALL_MCP_PAT}');
});

it('marks superseded specifications and plans as archived', () => {
  for (const path of [
    'docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md',
    'docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md',
    'docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md',
    'docs/superpowers/plans/2026-07-20-webapi-pat-auth.md'
  ]) {
    expect(readFileSync(path, 'utf8')).toContain('历史归档');
  }
});
```

现有架构图断言增加 `TVCMALL_API_KEY`，并继续保留 WebApi 出站 `Authorization: Bearer`、session 关闭和错误映射断言。

- [ ] **Step 3: 运行文档契约测试并确认 RED**

Run:

```bash
npm test -- tests/unit/remote-readme.test.ts
```

Expected: FAIL，当前公开文档仍把入站 Header 写成 Authorization，权威文档仍读取共享环境变量，旧资料未全部标记归档。

### Task 6: 更新权威说明、架构图和全部当前文档

**Files:**
- Modify: `tvcmall-webapi mcp开发接入说明文档.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/harness.md`
- Modify: `docs/remote-streamable-http-mcp-architecture.md`
- Modify: `docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md`
- Modify: `docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md`
- Modify: `docs/superpowers/plans/2026-07-20-webapi-pat-auth.md`
- Test: `tests/unit/remote-readme.test.ts`

- [ ] **Step 1: 修订根目录权威接入说明**

文档明确两段请求：

```http
# MCP Client -> MCP Server
TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}

# MCP Server -> TVCMall WebApi
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

角色表改为“Agent Client 保存每用户 PAT；MCP Server 从当前 session 读取”。伪代码必须显式接收 PAT：

```ts
async function callTvcmallWebApi(pat: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${process.env.TVCMALL_WEBAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${pat}`,
      'X-TVCMall-MCP-Client': 'tvcmall-mcp-server'
    }
  });
  return response.json();
}
```

安全要求删除 server 环境变量/部署 secret 共享 PAT 说法，改为 PAT 仅在 session 内存；明确本仓库只调用 WebApi，不实现或直连 WebApi、ApplicationServices、RDS。

- [ ] **Step 2: 更新 README 和 API/MVP/harness 契约**

客户端 JSON 统一使用：

```json
"headers": {
  "TVCMALL_API_KEY": "tmcp_v1_{tokenId}.{secret}"
}
```

README 将 `https://mcp.example.com/mcp` 标注为部署方替换的示例 URL；curl 使用安全 shell 变量：

```bash
curl https://mcp.example.com/mcp \
  -H "TVCMALL_API_KEY: ${TVCMALL_API_KEY:?请先安全设置该变量}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"example","version":"1.0.0"}}}'
```

`TVCMALL_WEBAPI_BASE_URL` 文档明确必须包含真实 WebApi 基础路径（示例 `/api`）并继续强制 HTTPS。删除 README 对 `Retry-After` 透传的暗示。积分记录明确说明 `/api/v3/user/points/list` 投产前必须登记 allowlist，未登记时返回 `403 PERMISSION_DENIED`。

- [ ] **Step 3: 更新 Mermaid 技术架构图与数据流图**

技术架构图入站边改为 `TVCMALL_API_KEY: tmcp_v1_...`，Guard 改为 `API KEY/PAT 基本格式`，Edge/日志规则同时禁止记录 `TVCMALL_API_KEY` 与下游 `Authorization`。出站边明确 `Authorization: Bearer 同一 PAT`。

数据流图 initialize、`tools/list`、`tools/call`、`DELETE` 都使用 `TVCMALL_API_KEY`。session 校验步骤写成“校验指纹并暂停 idle timer”，请求结束后再“刷新 idle TTL”。WebApi 内部继续移除下游 `Authorization`。

- [ ] **Step 4: 归档旧规格和计划**

四份旧文档开头增加：

```markdown
> 状态：历史归档。当前客户端入站认证以 `docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md` 和公开 API 契约为准；本文不得作为当前实施入口。
```

`docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md` 不再把 07-20 计划称为当前实施计划；07-20 计划标注已经执行完成并被 07-22 Header 切换取代。

- [ ] **Step 5: 运行文档测试并确认 GREEN**

Run:

```bash
npm test -- tests/unit/remote-readme.test.ts
```

Expected: 文档契约测试全部通过。

- [ ] **Step 6: 搜索当前文档中的旧入站配置残留**

Run:

```bash
rg -n '"Authorization": "Bearer|每个 `/mcp` 请求.*Authorization|process\.env\.TVCMALL_MCP_PAT|校验.*刷新 idle TTL' README.md AGENTS.md docs/api-contract.md docs/mvp-scope.md docs/harness.md docs/remote-streamable-http-mcp-architecture.md 'tvcmall-webapi mcp开发接入说明文档.md'
```

Expected: 不出现旧客户端 JSON、共享 PAT 环境变量或“校验时立即刷新 TTL”的表述；WebApi 出站 `Authorization: Bearer` 和请求结束后刷新 TTL 保留。

- [ ] **Step 7: 提交文档与契约测试**

```bash
git add README.md AGENTS.md docs tests/unit/remote-readme.test.ts 'tvcmall-webapi mcp开发接入说明文档.md'
git commit -m "docs: align remote MCP API key authorization"
```

### Task 7: 完整验证与安全复核

**Files:**
- Verify only

- [ ] **Step 1: 运行完整单元与集成测试**

Run:

```bash
npm test
```

Expected: 全部测试文件通过，0 failed。

- [ ] **Step 2: 运行类型检查与构建**

Run:

```bash
npm run typecheck
npm run build
```

Expected: 两个命令 exit 0，`dist/` 从当前源码重新生成。

- [ ] **Step 3: 再次运行真实端口和 stdio 集成测试**

Run:

```bash
npm test -- tests/integration/mcp-streamable-http.test.ts tests/integration/mcp-stdio.test.ts
```

Expected: 两个集成测试文件全部通过；stdio stderr 仍为空。

- [ ] **Step 4: 运行静态泄漏与旧契约检查**

Run:

```bash
rg -n "readBearerPat|使用假数据|VALIDATION_ERROR" src
rg -n '"Authorization": "Bearer|Bearer \$\{TVCMALL_MCP_PAT\}|process\.env\.TVCMALL_MCP_PAT' README.md AGENTS.md docs/api-contract.md docs/mvp-scope.md docs/harness.md docs/remote-streamable-http-mcp-architecture.md 'tvcmall-webapi mcp开发接入说明文档.md'
git diff --check
git status --short
```

Expected: 源码和当前公开文档无旧入站配置、假数据 metadata、共享 PAT 环境变量或废弃错误码；WebApi clients 的出站 `Authorization` 仍由既有 client tests 覆盖；diff check 无错误；工作树只包含验证构建产生的预期 tracked `dist` 变化或为空。

- [ ] **Step 5: 若 build 产生 tracked dist 变化，将其与实现一致提交**

```bash
git add dist
git commit -m "build: refresh remote MCP distribution"
```

仅在 `git status --short dist` 有输出时执行；不得创建空提交。
