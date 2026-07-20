# Remove Order Export Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 TVCMall MCP 的订单导出 tool、文件生成和下载能力，同时保留其余远程只读查询工具。

**Architecture:** MCP tool 注册表不再公开导出能力；远程 HTTP 服务仅保留 MCP 协议和健康检查端点。运行时配置、导出文件实现、测试和文档同步删除，避免存在无入口的 PII 文件处理代码。

**Tech Stack:** TypeScript、Node.js、MCP SDK、Vitest、Markdown/Mermaid。

---

### Task 1: 删除导出 tool 与文件实现

**Files:**
- Delete: `src/tools/export-orders.ts`
- Delete: `src/export/csv-exporter.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `src/errors/mcp-errors.ts`
- Delete: `tests/unit/export-orders-tool.test.ts`
- Test: `tests/unit/server.test.ts`

- [ ] **Step 1: 写 tool 列表不包含导出的失败测试**

```ts
it('does not register the removed order export tool', () => {
  const server = createTvcMallMcpServer({ authContext });
  expect(listRegisteredToolNames(server)).not.toContain('tvcmall_export_orders');
});
```

- [ ] **Step 2: 运行测试确认旧注册存在**

Run: `npm test -- tests/unit/server.test.ts`

Expected: FAIL，因为 `tvcmall_export_orders` 仍被注册。

- [ ] **Step 3: 删除 tool、CSV exporter 和注册引用**

从 `register-tools.ts` 删除 export schema、handler import 和 `server.registerTool('tvcmall_export_orders', ...)`；删除 `export-orders.ts`、`csv-exporter.ts` 及导出专用错误消息。不得修改商品、积分、运费、订单或物流 handler。

- [ ] **Step 4: 运行受影响测试**

Run: `npm test -- tests/unit/server.test.ts tests/unit/orders-tools.test.ts tests/unit/tracking-tools.test.ts`

Expected: PASS；tool 列表不再包含导出，其余查询 tool 保持可用。

### Task 2: 删除远程导出路由和配置

**Files:**
- Delete: `src/export/export-store.ts`（如当前分支存在）
- Modify: `src/http/mcp-http-server.ts`
- Modify: `src/config/runtime-config.ts`
- Modify: `tests/unit/runtime-config.test.ts`
- Modify: `tests/integration/mcp-streamable-http.test.ts`
- Delete: `tests/unit/export-store.test.ts`（如当前分支存在）

- [ ] **Step 1: 写 HTTP 路由不存在的失败测试**

```ts
it('does not expose an order export download endpoint', async () => {
  const response = await fetch(`${baseUrl}/exports/export_123`, { headers: authorizationHeaders });
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: 运行测试确认旧下载路由存在或测试缺失**

Run: `npm test -- tests/integration/mcp-streamable-http.test.ts`

Expected: FAIL，直至导出路由被删除或该行为已有实测。

- [ ] **Step 3: 删除导出路由、存储依赖与运行时配置**

移除 `/exports/:exportId` 处理、Export Store 注入以及 `exportDir`/`exportTtlMs` 配置字段与环境变量读取。删除相关测试；`/mcp` 和 `/healthz` 继续可用。

- [ ] **Step 4: 运行 HTTP 和配置测试**

Run: `npm test -- tests/integration/mcp-streamable-http.test.ts tests/unit/runtime-config.test.ts`

Expected: PASS；导出 URL 为 `404`，MCP 和健康检查不受影响。

### Task 3: 删除文档内容并完成验证

**Files:**
- Modify: `README.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/harness.md`
- Modify: `docs/remote-streamable-http-mcp-architecture.md`
- Modify: `docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md`
- Test: `tests/unit/remote-readme.test.ts`（如当前分支存在）

- [ ] **Step 1: 写文档中不再出现导出 API 的失败检查**

```ts
it('does not document the removed export tool or download endpoint', () => {
  const docs = readProjectMarkdown();
  expect(docs).not.toContain('tvcmall_export_orders');
  expect(docs).not.toContain('/exports/:exportId');
});
```

- [ ] **Step 2: 运行检查确认旧文档内容存在**

Run: `npm test -- tests/unit/remote-readme.test.ts`

Expected: FAIL，直至文档完成清理；若该测试文件尚不存在，则使用 `rg` 作为验证命令。

- [ ] **Step 3: 更新公开与设计文档**

删除导出能力、导出权限、服务端文件、下载 URL、文件 TTL、导出环境变量、示例问题、验收标准和风险说明。架构图删除 Export Store、订单导出数据源和下载时序；保留 MCP Client PAT、session 指纹绑定、同一 PAT 透传到现有 WebApi route，以及 WebApi → ApplicationServices → RDS 的授权边界。

- [ ] **Step 4: 搜索残留并运行完整验证**

Run: `rg -n -i "tvcmall_export_orders|/exports/|orders:export|exportDir|exportTtl|csv-exporter|订单导出" src tests README.md docs && npm test && npm run typecheck && npm run build`

Expected: `rg` 对实现和当前态公开文档无匹配；负向测试和本移除计划/设计中的历史删除说明允许匹配；所有测试、类型检查和构建通过。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: 移除订单导出能力"
```
