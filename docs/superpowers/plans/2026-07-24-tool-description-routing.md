# TVCMall MCP 工具路由描述优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化所有 TVCMall MCP 工具描述，使模型能依据用户意图、已有标识符和排他规则选择正确的只读工具。

**Architecture:** 保持现有 MCP 注册和 schema 不变，只更新 `registerTvcMallTools` 的 `description` 元数据。单元测试通过 MCP Server 已注册的工具元数据断言完整描述，防止相近工具间的路由规则退化。

**Tech Stack:** Node.js 20+、TypeScript、`@modelcontextprotocol/sdk`、Vitest。

---

## 文件结构

修改文件：

- `src/app/register-tools.ts`：为全部 11 个工具提供面向模型路由的中文描述。
- `tests/unit/server.test.ts`：覆盖工具描述、认证状态语义和工具间的分流规则。

### Task 1: 为路由描述添加失败回归测试

**Files:**
- Modify: `tests/unit/server.test.ts:42-70`

- [ ] **Step 1: 将现有描述断言替换为完整的目标描述表**

在 `tests/unit/server.test.ts` 中，以以下测试替换 `guides order logistics...` 与 `publishes real read-only...` 两个测试：

```typescript
  it('publishes descriptions that route related requests to the correct tools', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    })._registeredTools;

    const expectedDescriptions = {
      tvcmall_auth_status: '用于检查当前 MCP 会话是否已配置 TVCMALL_API_KEY；仅返回配置状态，不验证凭证有效性，也不调用 WebApi。',
      tvcmall_search_products: '用于按关键词分页搜索商品；已知 product_id 并需要 SKU、价格、库存或属性详情时，使用 tvcmall_get_product_detail。',
      tvcmall_get_product_detail: '用于按 product_id 查询单个商品的 SKU、价格、库存和属性详情；需要按关键词查找商品时，使用 tvcmall_search_products。',
      tvcmall_get_points: '用于查询当前客户的积分汇总；需要逐笔积分获取和使用记录时，使用 tvcmall_list_point_records。',
      tvcmall_list_point_records: '用于分页查询当前客户的积分获取和使用记录；需要积分汇总时，使用 tvcmall_get_points。',
      tvcmall_list_balance_records: '用于按 all、income 或 expense 分页查询当前客户的余额流水；积分查询请使用 tvcmall_get_points 或 tvcmall_list_point_records。',
      tvcmall_estimate_shipping: '用于按 sku、quantity 和 countrycode 预估未下单商品的运费；已有订单的物流、运费、shipping fee、freight 或 delivery cost 必须使用 tvcmall_get_tracking_info。',
      tvcmall_list_orders: '用于按状态或日期分页查询订单列表；已知 order_id 并需要商品、金额或收货信息时，使用 tvcmall_get_order_detail。',
      tvcmall_get_order_detail: '用于按 order_id 查询订单商品、金额和后端已脱敏的收货信息；订单物流、物流轨迹或运费必须使用 tvcmall_get_tracking_info。',
      tvcmall_get_tracking_info: '用于按单个 order_id 查询订单物流轨迹和订单运费；多个订单同时查询时，使用 tvcmall_batch_get_tracking。',
      tvcmall_batch_get_tracking: '用于批量查询多个订单的物流和订单运费；只有单个订单时，使用 tvcmall_get_tracking_info。'
    };

    expect(Object.fromEntries(
      Object.keys(expectedDescriptions).map((toolName) => [toolName, registeredTools[toolName]?.description])
    )).toEqual(expectedDescriptions);
    expect(JSON.stringify(registeredTools)).not.toContain('使用假数据');
  });
```

- [ ] **Step 2: 运行目标测试并确认失败原因是旧描述**

Run: `npm test -- tests/unit/server.test.ts`

Expected: FAIL，`publishes descriptions that route related requests to the correct tools` 中至少一个 `description` 与 `expectedDescriptions` 不一致；不应出现 TypeScript 编译或测试环境错误。

### Task 2: 最小化更新工具注册元数据

**Files:**
- Modify: `src/app/register-tools.ts:62-131`

- [ ] **Step 1: 将 11 个 `description` 更新为测试中的相同字符串**

在各 `server.registerTool()` 注册项中设置以下字符串；不修改 `title`、`inputSchema`、`outputSchema`、回调或依赖注入：

```typescript
'用于检查当前 MCP 会话是否已配置 TVCMALL_API_KEY；仅返回配置状态，不验证凭证有效性，也不调用 WebApi。'
'用于按关键词分页搜索商品；已知 product_id 并需要 SKU、价格、库存或属性详情时，使用 tvcmall_get_product_detail。'
'用于按 product_id 查询单个商品的 SKU、价格、库存和属性详情；需要按关键词查找商品时，使用 tvcmall_search_products。'
'用于查询当前客户的积分汇总；需要逐笔积分获取和使用记录时，使用 tvcmall_list_point_records。'
'用于分页查询当前客户的积分获取和使用记录；需要积分汇总时，使用 tvcmall_get_points。'
'用于按 all、income 或 expense 分页查询当前客户的余额流水；积分查询请使用 tvcmall_get_points 或 tvcmall_list_point_records。'
'用于按 sku、quantity 和 countrycode 预估未下单商品的运费；已有订单的物流、运费、shipping fee、freight 或 delivery cost 必须使用 tvcmall_get_tracking_info。'
'用于按状态或日期分页查询订单列表；已知 order_id 并需要商品、金额或收货信息时，使用 tvcmall_get_order_detail。'
'用于按 order_id 查询订单商品、金额和后端已脱敏的收货信息；订单物流、物流轨迹或运费必须使用 tvcmall_get_tracking_info。'
'用于按单个 order_id 查询订单物流轨迹和订单运费；多个订单同时查询时，使用 tvcmall_batch_get_tracking。'
'用于批量查询多个订单的物流和订单运费；只有单个订单时，使用 tvcmall_get_tracking_info。'
```

- [ ] **Step 2: 重新运行目标测试并确认通过**

Run: `npm test -- tests/unit/server.test.ts`

Expected: PASS，`4 tests passed`，且输出不包含失败、错误或敏感凭证。

### Task 3: 全量验证并提交

**Files:**
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/server.test.ts`
- Create: `docs/superpowers/plans/2026-07-24-tool-description-routing.md`

- [ ] **Step 1: 运行静态检查、全量测试和构建**

Run: `npm run typecheck && npm test && npm run build && git diff --check`

Expected: 每条命令退出码为 `0`；Vitest 无失败测试；TypeScript 不报错；构建成功；diff 不含空白错误。

- [ ] **Step 2: 核对变更范围和敏感信息**

Run: `git diff --check && git diff -- src/app/register-tools.ts tests/unit/server.test.ts docs/superpowers/plans/2026-07-24-tool-description-routing.md`

Expected: 仅包含工具描述、描述回归测试和本计划；不包含 `TVCMALL_API_KEY` 值、PAT、`Authorization` 或客户 PII。

- [ ] **Step 3: 创建中文提交**

```bash
git add src/app/register-tools.ts tests/unit/server.test.ts docs/superpowers/plans/2026-07-24-tool-description-routing.md
git commit -m "优化：完善 MCP 工具路由描述"
```
