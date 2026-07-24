# 积分流水方向筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `tvcmall_list_point_records` 按 `all`、`got`、`used` 筛选积分流水，并向 WebApi 发送对应的 `pointstype=0`、`1`、`2`。

**Architecture:** 在积分领域增加独立 `PointRecordsDirection`，与 WebApi 数字参数隔离。Zod schema 为模型提供默认值和自然语言映射，HTTP client 进行固定映射，fake client 用虚构 `earn` / `use` 记录覆盖本地筛选行为。

**Tech Stack:** Node.js 20+、TypeScript、Zod、`@modelcontextprotocol/sdk`、Vitest。

---

## 文件结构

修改：

- `src/points/points-client.ts`：定义方向类型，并让解析后的列表输入携带方向。
- `src/tools/points.ts`：扩展 MCP 输入 schema、输出回显和摘要。
- `src/points/http-points-client.ts`：添加 `direction` 到 `pointstype` 的映射。
- `src/points/fake-points-client.ts`：按 fixture 类型筛选记录。
- `src/app/register-tools.ts`、`docs/api-contract.md`：发布模型路由说明和 API 契约。
- `tests/unit/http-points-client.test.ts`、`tests/unit/points-tools.test.ts`、`tests/unit/server.test.ts`：覆盖映射、默认值、fake 筛选和描述。

### Task 1: 写出失败的方向筛选测试

**Files:**
- Modify: `tests/unit/http-points-client.test.ts:1-85`
- Modify: `tests/unit/points-tools.test.ts:1-55`

- [ ] **Step 1: 参数化 HTTP `pointstype` 映射测试**

从 `src/tools/points.js` 导入 `ListPointRecordsInputSchema`，将当前积分流水 HTTP 测试替换为：

```typescript
it.each([
  ['all', '0'],
  ['got', '1'],
  ['used', '2']
] as const)('maps direction %s to pointstype=%s', async (direction, pointsType) => {
  const fetchMock = vi.fn(async () => jsonResponse({ data: { total: 0, list: [] } }));
  const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });
  const input = ListPointRecordsInputSchema.parse({ page: 3, page_size: 10, direction });

  await client.listPointRecords(input, session);

  const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const parsedUrl = new URL(url);
  expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({
    pageindex: '3',
    pagesize: '10',
    pointstype: pointsType
  });
});

it('defaults an omitted direction to pointstype=0', async () => {
  const fetchMock = vi.fn(async () => jsonResponse({ data: { total: 0, list: [] } }));
  const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });
  const input = ListPointRecordsInputSchema.parse({ page: 1, page_size: 20 });

  await client.listPointRecords(input, session);

  const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).searchParams.get('pointstype')).toBe('0');
});
```

- [ ] **Step 2: 断言 MCP 默认值、非法值和 fake 筛选**

在 `tests/unit/points-tools.test.ts` 中导入 `ListPointRecordsInputSchema`，添加：

```typescript
it('defaults direction to all, rejects invalid values, and filters fake records', async () => {
  const pointsClient = new FakePointsClient();
  const listPointRecords = vi.spyOn(pointsClient, 'listPointRecords');

  const all = await listPointRecordsForMcp({ page: 1, page_size: 20 }, { authContext, pointsClient });
  const got = await listPointRecordsForMcp({ page: 1, page_size: 20, direction: 'got' }, { authContext, pointsClient });
  const used = await listPointRecordsForMcp({ page: 1, page_size: 20, direction: 'used' }, { authContext, pointsClient });

  expect(listPointRecords).toHaveBeenNthCalledWith(1, expect.objectContaining({ direction: 'all' }), expect.anything());
  expect(all.structuredContent).toMatchObject({ direction: 'all', total: 2 });
  expect(got.structuredContent).toMatchObject({ direction: 'got', total: 1, items: [expect.objectContaining({ type: 'earn' })] });
  expect(used.structuredContent).toMatchObject({ direction: 'used', total: 1, items: [expect.objectContaining({ type: 'use' })] });
  expect(() => ListPointRecordsInputSchema.parse({ page: 1, page_size: 20, direction: 'income' })).toThrow();
});
```

- [ ] **Step 3: 验证失败**

Run: `npm test -- tests/unit/http-points-client.test.ts tests/unit/points-tools.test.ts`

Expected: FAIL，现有 schema 不接受 `direction`，HTTP URL 缺少 `pointstype`，fake 输出没有方向字段或筛选。

### Task 2: 实现 MCP 方向和 WebApi 映射

**Files:**
- Modify: `src/points/points-client.ts:3-21`
- Modify: `src/tools/points.ts:15-41`
- Modify: `src/points/http-points-client.ts:1-43`
- Modify: `src/points/fake-points-client.ts:18-30`

- [ ] **Step 1: 定义领域方向和结果回显**

在 `src/points/points-client.ts` 新增：

```typescript
export type PointRecordsDirection = 'all' | 'got' | 'used';
```

将 `ListPointRecordsInput` 的 `direction` 设为必填 `PointRecordsDirection`，将 `ListPointRecordsResult` 的 `direction` 设为同一类型。

- [ ] **Step 2: 扩展 Zod schema 与摘要**

在 `src/tools/points.ts` 的输入 schema 中添加：

```typescript
direction: z.enum(['all', 'got', 'used']).default('all').describe(
  '积分流水方向：全部或未指定为 all；获得、获取积分为 got；使用、消耗积分为 used。'
),
```

将 `ListPointRecordsInput` 改为 `z.input<typeof ListPointRecordsInputSchema>`，并在输出 schema 增加 `direction: z.enum(['all', 'got', 'used'])`。摘要按 `got` 输出“积分获取”、按 `used` 输出“积分使用”、否则输出“积分”。

- [ ] **Step 3: 原样映射 HTTP 与 fake**

在 `src/points/http-points-client.ts` 定义：

```typescript
const POINTS_TYPE_BY_DIRECTION: Record<PointRecordsDirection, string> = {
  all: '0',
  got: '1',
  used: '2'
};
```

将 `pointstype: POINTS_TYPE_BY_DIRECTION[input.direction]` 加入 `createUrl()` 参数，结果返回 `{ ...input, total, items }`。在 `FakePointsClient` 中，`all` 使用全部 fixture，`got` 只保留 `type === 'earn'`，`used` 只保留 `type === 'use'`，并回显 `{ ...input }`。

- [ ] **Step 4: 验证通过**

Run: `npm test -- tests/unit/http-points-client.test.ts tests/unit/points-tools.test.ts`

Expected: PASS，3 个方向映射为对应 `pointstype`，默认值、非法值拒绝和 fake 筛选符合契约。

### Task 3: 发布模型说明与 API 契约

**Files:**
- Modify: `src/app/register-tools.ts:87-90`
- Modify: `tests/unit/server.test.ts:47-74`
- Modify: `docs/api-contract.md:249`

- [ ] **Step 1: 更新工具描述和精确测试**

将 `tvcmall_list_point_records` 描述和 `tests/unit/server.test.ts` 中的期望更新为：

```typescript
'用于按方向分页查询当前客户的积分流水。direction：全部或未指定为 all；获得、获取积分为 got；使用、消耗积分为 used。需要积分汇总时，使用 tvcmall_get_points。'
```

- [ ] **Step 2: 更新 API 契约总览**

将工具输入摘要更新为：

```markdown
`direction=all`、`page=1`、`page_size=20`（最大 50）
```

- [ ] **Step 3: 验证模型契约**

Run: `npm test -- tests/unit/server.test.ts tests/unit/points-tools.test.ts`

Expected: PASS，模型可见描述和输入 schema 的方向语义保持一致。

### Task 4: 完整验证与中文提交

**Files:**
- Modify: `src/points/points-client.ts`
- Modify: `src/tools/points.ts`
- Modify: `src/points/http-points-client.ts`
- Modify: `src/points/fake-points-client.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/http-points-client.test.ts`
- Modify: `tests/unit/points-tools.test.ts`
- Modify: `tests/unit/server.test.ts`
- Modify: `docs/api-contract.md`
- Create: `docs/superpowers/plans/2026-07-24-point-records-direction-filter.md`

- [ ] **Step 1: 运行完整验证**

Run: `npm run typecheck && npm test && npm run build && git diff --check`

Expected: 所有命令退出码为 `0`，Vitest 无失败测试，TypeScript 无错误，构建成功且 diff 无空白错误。

- [ ] **Step 2: 审查范围和敏感信息**

Run: `git diff --check && git diff -- src/points src/tools/points.ts src/app/register-tools.ts tests/unit/http-points-client.test.ts tests/unit/points-tools.test.ts tests/unit/server.test.ts docs/api-contract.md docs/superpowers/plans/2026-07-24-point-records-direction-filter.md`

Expected: 仅包含积分流水方向筛选契约、测试、文档和计划；不含 PAT、`Authorization`、`TVCMALL_API_KEY` 值或客户 PII。

- [ ] **Step 3: 创建中文提交**

```bash
git add src/points/points-client.ts src/tools/points.ts src/points/http-points-client.ts src/points/fake-points-client.ts src/app/register-tools.ts tests/unit/http-points-client.test.ts tests/unit/points-tools.test.ts tests/unit/server.test.ts docs/api-contract.md docs/superpowers/plans/2026-07-24-point-records-direction-filter.md
git commit -m "优化：支持积分流水方向筛选"
```
