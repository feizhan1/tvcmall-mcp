# 订单列表 WebApi 状态筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `tvcmall_list_orders` 直接接受 6 个 WebApi `status` 筛选值，默认 `V3All`，并在模型可见的工具契约中说明用户意图到参数的映射。

**Architecture:** 将列表查询筛选值抽成独立 `OrderListStatusFilter`，保持订单响应的 `OrderStatus` 不变。Zod schema 提供默认值与字段说明，HTTP client 原样发送筛选值，工具描述和 API 契约提供相同的自然语言映射。

**Tech Stack:** Node.js 20+、TypeScript、Zod、`@modelcontextprotocol/sdk`、Vitest。

---

## 文件结构

修改：

- `src/orders/order-client.ts`：新增筛选状态类型，更新 `ListOrdersInput`。
- `src/tools/orders.ts`：新增 6 值 Zod enum、默认值和字段说明。
- `src/orders/http-order-client.ts`：原样发送筛选值。
- `src/orders/fake-order-client.ts`：不将 WebApi 筛选状态与旧输出摘要状态直接比较。
- `src/app/register-tools.ts`、`docs/api-contract.md`：发布用户意图映射。
- `tests/unit/http-order-client.test.ts`、`tests/unit/orders-tools.test.ts`、`tests/unit/server.test.ts`：覆盖请求、默认值和模型可见描述。

### Task 1: 写出失败的 WebApi 状态契约测试

**Files:**
- Modify: `tests/unit/http-order-client.test.ts:1-72`
- Modify: `tests/unit/orders-tools.test.ts:1-44`

- [ ] **Step 1: 参数化 WebApi 请求测试**

从 `src/tools/orders.js` 导入 `ListOrdersInputSchema`，以如下测试替换当前订单列表 HTTP 测试：

```typescript
it.each(['V3All', 'V3Unpaid', 'V3AwaitingConfirmation', 'V3Preparing', 'V3Shipped', 'V3Done'] as const)(
  'sends WebApi order filter %s unchanged',
  async (status) => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { total: 0, list: [] } }));
    const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    await client.listOrders({ page: 1, page_size: 10, status }, session);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      pageindex: 1,
      pagesize: 10,
      status,
      withdetail: true
    });
  }
);

it('defaults an omitted MCP status to V3All before calling WebApi', async () => {
  const fetchMock = vi.fn(async () => jsonResponse({ data: { total: 0, list: [] } }));
  const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });
  const input = ListOrdersInputSchema.parse({ page: 1, page_size: 10 });

  await client.listOrders(input, session);

  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string)).toMatchObject({ status: 'V3All' });
});
```

- [ ] **Step 2: 验证 MCP 默认值和旧筛选值拒绝**

在 `tests/unit/orders-tools.test.ts` 新增：

```typescript
it('defaults the MCP order filter to V3All and rejects legacy filter values', async () => {
  const orderClient = new FakeOrderClient();
  const listOrders = vi.spyOn(orderClient, 'listOrders');

  await listOrdersForMcp({ page: 1, page_size: 20 }, { authContext, orderClient });

  expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ status: 'V3All' }), expect.anything());
  expect(() => ListOrdersInputSchema.parse({ page: 1, page_size: 20, status: 'shipped' })).toThrow();
});
```

- [ ] **Step 3: 运行失败测试**

Run: `npm test -- tests/unit/http-order-client.test.ts tests/unit/orders-tools.test.ts`

Expected: FAIL，因为旧 schema 拒绝 `V3*` 值，且旧 HTTP 默认值是 `All`。

### Task 2: 分离输入筛选状态并原样发送

**Files:**
- Modify: `src/orders/order-client.ts:3-10`
- Modify: `src/tools/orders.ts:8-15`
- Modify: `src/orders/http-order-client.ts:10-21`
- Modify: `src/orders/fake-order-client.ts:6-17`

- [ ] **Step 1: 定义独立筛选类型**

在 `src/orders/order-client.ts` 的 `OrderStatus` 后新增：

```typescript
export type OrderListStatusFilter =
  | 'V3All'
  | 'V3Unpaid'
  | 'V3AwaitingConfirmation'
  | 'V3Preparing'
  | 'V3Shipped'
  | 'V3Done';
```

将 `ListOrdersInput.status` 变为必填 `OrderListStatusFilter`。不要改变 `OrderSummary.status` 或 `OrderDetail.status`。

- [ ] **Step 2: 更新 Zod schema**

保留 `OrderStatusSchema` 供输出使用，新增并使用：

```typescript
const OrderListStatusFilterSchema = z.enum([
  'V3All', 'V3Unpaid', 'V3AwaitingConfirmation', 'V3Preparing', 'V3Shipped', 'V3Done'
]).default('V3All').describe(
  '订单列表筛选：全部或未指定为 V3All；待付款为 V3Unpaid；待确认为 V3AwaitingConfirmation；备货中为 V3Preparing；已发货为 V3Shipped；已完成为 V3Done。'
);
```

- [ ] **Step 3: 更新 client 和 fake**

将 `HttpOrderClient` 请求体的 `status` 改为 `input.status`，删除 `?? 'All'`。在 `FakeOrderClient` 中删除 `order.status !== input.status` 比较，仅按日期和分页处理 fixture，避免把旧输出状态错误当作 WebApi 筛选状态。

- [ ] **Step 4: 验证通过**

Run: `npm test -- tests/unit/http-order-client.test.ts tests/unit/orders-tools.test.ts`

Expected: PASS；6 个值原样发送，默认值为 `V3All`，旧筛选值被拒绝。

### Task 3: 发布模型路由说明与 API 契约

**Files:**
- Modify: `src/app/register-tools.ts:110`
- Modify: `tests/unit/server.test.ts:47-74`
- Modify: `docs/api-contract.md:241-308`

- [ ] **Step 1: 更新工具描述和测试期望**

对 `tvcmall_list_orders` 使用以下描述，并在 `tests/unit/server.test.ts` 使用同一字符串：

```typescript
'用于按 WebApi 状态或日期分页查询订单列表。status：全部或未指定为 V3All；待付款为 V3Unpaid；待确认为 V3AwaitingConfirmation；备货中为 V3Preparing；已发货为 V3Shipped；已完成为 V3Done。已知 order_id 并需要商品、金额或收货信息时，使用 tvcmall_get_order_detail。'
```

- [ ] **Step 2: 更新 API 契约**

将总览输入摘要改为“可选日期、`status=V3All`、`page=1`、`page_size=20`（最大 50）”。将示例中的状态改为 `V3Shipped`，并写明：

```markdown
`status` 可为 `V3All`（默认，全部订单）、`V3Unpaid`（待付款）、`V3AwaitingConfirmation`（待确认）、`V3Preparing`（备货中）、`V3Shipped`（已发货）或 `V3Done`（已完成）。
```

- [ ] **Step 3: 验证描述和 schema**

Run: `npm test -- tests/unit/server.test.ts tests/unit/orders-tools.test.ts`

Expected: PASS，模型可见描述、字段默认值和状态筛选值一致。

### Task 4: 完整验证与提交

**Files:**
- Modify: `src/orders/order-client.ts`
- Modify: `src/tools/orders.ts`
- Modify: `src/orders/http-order-client.ts`
- Modify: `src/orders/fake-order-client.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/http-order-client.test.ts`
- Modify: `tests/unit/orders-tools.test.ts`
- Modify: `tests/unit/server.test.ts`
- Modify: `docs/api-contract.md`
- Create: `docs/superpowers/plans/2026-07-24-order-list-webapi-status.md`

- [ ] **Step 1: 完整验证**

Run: `npm run typecheck && npm test && npm run build && git diff --check`

Expected: 所有命令退出码为 `0`，且没有测试失败、编译错误或 diff 空白错误。

- [ ] **Step 2: 审查变更范围**

Run: `git diff --check && git diff -- src/orders src/tools/orders.ts src/app/register-tools.ts tests/unit/http-order-client.test.ts tests/unit/orders-tools.test.ts tests/unit/server.test.ts docs/api-contract.md docs/superpowers/plans/2026-07-24-order-list-webapi-status.md`

Expected: 仅包含订单状态筛选契约、测试、文档和计划；不含 PAT、`Authorization`、`TVCMALL_API_KEY` 值或客户 PII。

- [ ] **Step 3: 中文提交**

```bash
git add src/orders/order-client.ts src/tools/orders.ts src/orders/http-order-client.ts src/orders/fake-order-client.ts src/app/register-tools.ts tests/unit/http-order-client.test.ts tests/unit/orders-tools.test.ts tests/unit/server.test.ts docs/api-contract.md docs/superpowers/plans/2026-07-24-order-list-webapi-status.md
git commit -m "修复：对齐订单列表 WebApi 状态筛选"
```
