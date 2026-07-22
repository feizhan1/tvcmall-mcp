# Balance Records MCP Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `tvcmall_list_balance_records`，让用户可按全部、获取、消耗筛选并分页查询 TVCMall 余额流水。

**Architecture:** 新建独立 `balance` 领域，领域 interface 隔离 fake fixture 与 WebApi 实现；`src/tools/balance.ts` 负责 Zod 契约、认证检查和 AI 摘要；应用装配沿用 client factory、集中注册和 session PAT 透传模式。真实 client 只调用 allowlist 中的 `GET /v3/user/balance/list`，将 MCP `direction` 映射为 WebApi `pointstype` 并移除 `UserID`。

**Tech Stack:** Node.js 20+、TypeScript、`@modelcontextprotocol/sdk`、Zod、内置 `fetch`、Vitest。

---

## 文件结构

新增文件：

- `src/balance/balance-client.ts`：余额流水领域类型和 `BalanceClient` interface。
- `src/balance/fake-balance-client.ts`：按方向和分页读取虚构 fixture。
- `src/balance/http-balance-client.ts`：调用 WebApi 并映射受控领域结果。
- `src/fixtures/balance.ts`：无真实用户数据的余额流水 fixture。
- `src/tools/balance.ts`：MCP 输入/输出 schema、认证边界、摘要和 wrapper。
- `tests/unit/fake-balance-client.test.ts`：fake 筛选与分页测试。
- `tests/unit/http-balance-client.test.ts`：route、query、PAT 和响应映射测试。
- `tests/unit/balance-tools.test.ts`：tool 默认值、schema、认证与脱敏测试。
- `tests/unit/balance-docs.test.ts`：当前文档契约一致性测试。

修改文件：

- `src/app/client-factory.ts`：装配 fake/HTTP balance client。
- `src/app/register-tools.ts`：注册 `tvcmall_list_balance_records`。
- `src/server.ts`：允许注入并传递 `BalanceClient`。
- `tests/unit/client-factory.test.ts`：验证 balance client 装配及 timeout。
- `tests/unit/server.test.ts`：验证 tool 名称与描述。
- `tests/integration/mcp-stdio.test.ts`：验证内部 harness 可发现新 tool。
- `tests/integration/mcp-streamable-http.test.ts`：验证 PAT session 可远程调用新 tool。
- `README.md`：增加提问示例、Tools 表和 scope 说明。
- `docs/api-contract.md`：增加 tool 输入、输出、route 和错误契约。
- `docs/mvp-scope.md`：增加 v0.1 余额流水范围与验收项。
- `docs/harness.md`：记录 balance fixture/client 回归边界。
- `docs/external/余额流水.openapi.yaml`：保留上游契约，提交前清除真实样式的认证示例。
- `docs/external/api-responses/余额流水api.json`：保留响应结构，提交前替换用户标识。

外部文档由用户提供，是 route/query/响应映射的权威输入。实现不改变其字段结构或业务样例，但在纳入版本控制前必须将 OpenAPI 中真实样式的 `Authorization` 示例替换为明显虚构值，并将响应中的 `UserID` 替换为固定虚构 UUID。

### Task 1: 余额领域类型、fixture 与 fake client

**Files:**
- Create: `tests/unit/fake-balance-client.test.ts`
- Create: `src/balance/balance-client.ts`
- Create: `src/fixtures/balance.ts`
- Create: `src/balance/fake-balance-client.ts`

- [ ] **Step 1: 写出缺失模块的失败测试**

创建 `tests/unit/fake-balance-client.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { FakeBalanceClient } from '../../src/balance/fake-balance-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'fixture-customer', email: 'fixture@example.test' },
  scopes: [],
  accessToken: 'tmcp_v1_test-id.test-secret',
  refreshToken: '',
  expiresAt: '2099-01-01T00:00:00Z'
};

describe('FakeBalanceClient', () => {
  it('filters balance records by semantic direction', async () => {
    const client = new FakeBalanceClient();

    const income = await client.listBalanceRecords({ direction: 'income', page: 1, page_size: 20 }, session);
    const expense = await client.listBalanceRecords({ direction: 'expense', page: 1, page_size: 20 }, session);

    expect(income.items).toHaveLength(2);
    expect(income.items.every((item) => item.direction === 'income')).toBe(true);
    expect(expense.items).toHaveLength(1);
    expect(expense.items[0]?.direction).toBe('expense');
  });

  it('paginates after filtering and clones fixture records', async () => {
    const client = new FakeBalanceClient();
    const first = await client.listBalanceRecords({ direction: 'all', page: 2, page_size: 1 }, session);
    first.items[0]!.description = 'changed by test';
    const second = await client.listBalanceRecords({ direction: 'all', page: 2, page_size: 1 }, session);

    expect(first).toMatchObject({ direction: 'all', page: 2, page_size: 1, total: 3 });
    expect(second.items[0]?.description).not.toBe('changed by test');
  });
});
```

- [ ] **Step 2: 运行测试并确认因功能缺失而失败**

Run: `npm test -- tests/unit/fake-balance-client.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../../src/balance/fake-balance-client.js'`。

- [ ] **Step 3: 定义领域契约**

创建 `src/balance/balance-client.ts`：

```typescript
import type { StoredAuthSession } from '../storage/token-store.js';

export type BalanceDirectionFilter = 'all' | 'income' | 'expense';
export type BalanceRecordDirection = 'income' | 'expense' | 'unknown';

export interface ListBalanceRecordsInput {
  direction: BalanceDirectionFilter;
  page: number;
  page_size: number;
}

export interface BalanceRecord {
  id: string;
  amount: number;
  formatted_amount: string;
  direction: BalanceRecordDirection;
  type: string;
  description: string;
  order_id: string;
  display_date: string;
  created_at: string;
}

export interface ListBalanceRecordsResult extends ListBalanceRecordsInput {
  total: number;
  items: BalanceRecord[];
}

export interface BalanceClient {
  listBalanceRecords(input: ListBalanceRecordsInput, session: StoredAuthSession): Promise<ListBalanceRecordsResult>;
}
```

- [ ] **Step 4: 增加无 PII fixture**

创建 `src/fixtures/balance.ts`：

```typescript
import type { BalanceRecord } from '../balance/balance-client.js';

export const FIXTURE_BALANCE_RECORDS: BalanceRecord[] = [
  {
    id: 'bal_1001',
    amount: 25,
    formatted_amount: '$25.00',
    direction: 'income',
    type: 'OrderRefund',
    description: 'Order refund returned to balance',
    order_id: 'VFIXTURE10001',
    display_date: '07/18/2026',
    created_at: '2026-07-18 08:30:00'
  },
  {
    id: 'bal_1002',
    amount: -12.5,
    formatted_amount: '-$12.50',
    direction: 'expense',
    type: 'UseBalanceToOrder',
    description: 'Balance used for order',
    order_id: 'VFIXTURE10002',
    display_date: '07/19/2026',
    created_at: '2026-07-19 09:15:00'
  },
  {
    id: 'bal_1003',
    amount: 8,
    formatted_amount: '$8.00',
    direction: 'income',
    type: 'Adjustment',
    description: 'Balance adjustment',
    order_id: '',
    display_date: '07/20/2026',
    created_at: '2026-07-20 10:00:00'
  }
];
```

- [ ] **Step 5: 实现最小 fake client**

创建 `src/balance/fake-balance-client.ts`：

```typescript
import type { StoredAuthSession } from '../storage/token-store.js';
import { FIXTURE_BALANCE_RECORDS } from '../fixtures/balance.js';
import type { BalanceClient, ListBalanceRecordsInput, ListBalanceRecordsResult } from './balance-client.js';

export class FakeBalanceClient implements BalanceClient {
  async listBalanceRecords(input: ListBalanceRecordsInput, _session: StoredAuthSession): Promise<ListBalanceRecordsResult> {
    const records = input.direction === 'all'
      ? FIXTURE_BALANCE_RECORDS
      : FIXTURE_BALANCE_RECORDS.filter((item) => item.direction === input.direction);
    const start = (input.page - 1) * input.page_size;

    return {
      ...input,
      total: records.length,
      items: records.slice(start, start + input.page_size).map((item) => ({ ...item }))
    };
  }
}
```

- [ ] **Step 6: 运行测试并确认通过**

Run: `npm test -- tests/unit/fake-balance-client.test.ts`

Expected: PASS，`2 tests passed`。

- [ ] **Step 7: 提交领域基础**

```bash
git add src/balance/balance-client.ts src/balance/fake-balance-client.ts src/fixtures/balance.ts tests/unit/fake-balance-client.test.ts
git commit -m "feat: add balance records domain"
```

### Task 2: WebApi 余额流水 client

**Files:**
- Create: `tests/unit/http-balance-client.test.ts`
- Create: `src/balance/http-balance-client.ts`

- [ ] **Step 1: 写 route、筛选、PAT 和真实样例映射的失败测试**

创建 `tests/unit/http-balance-client.test.ts`，包含以下完整行为：

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { HttpBalanceClient } from '../../src/balance/http-balance-client.js';
import type { BalanceDirectionFilter } from '../../src/balance/balance-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const pat = 'tmcp_v1_token-id.secret-value';
const session: StoredAuthSession = {
  customer: { id: 'fixture-customer', email: 'fixture@example.test' },
  scopes: [],
  accessToken: pat,
  refreshToken: '',
  expiresAt: '2099-01-01T00:00:00Z'
};

describe('HttpBalanceClient', () => {
  it.each<[BalanceDirectionFilter, string]>([
    ['all', '0'],
    ['income', '1'],
    ['expense', '2']
  ])('maps %s to pointstype=%s and forwards the session PAT once', async (direction, pointsType) => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { model: { Total: 0, Balance: [] } } }));
    const client = new HttpBalanceClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    await client.listBalanceRecords({ direction, page: 3, page_size: 10 }, session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/user/balance/list');
    expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({ pageindex: '3', pagesize: '10', pointstype: pointsType });
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${pat}` });
    expect(JSON.stringify(init.headers)).not.toContain('Bearer Bearer');
  });

  it('maps the provided balance response without exposing UserID', async () => {
    const body = readFileSync(new URL('../../docs/external/api-responses/余额流水api.json', import.meta.url), 'utf8');
    const client = new HttpBalanceClient({
      baseUrl: 'https://api.tvcmall.test',
      fetch: vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
    });

    const result = await client.listBalanceRecords({ direction: 'all', page: 1, page_size: 20 }, session);

    expect(result.total).toBe(398);
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual({
      id: '113764',
      amount: 94.16,
      formatted_amount: '$94.16',
      direction: 'income',
      type: 'WaitUseBalanceToOrder-Revoked',
      description: '(Revoked)Wait For UseBalanceToOrder',
      order_id: 'V26071500020',
      display_date: '07/15/2026',
      created_at: '2026-07-15 11:21:14'
    });
    expect(JSON.stringify(result)).not.toContain('UserID');
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('uses unknown for an undocumented PointsType instead of guessing from amount', async () => {
    const client = new HttpBalanceClient({
      baseUrl: 'https://api.tvcmall.test',
      fetch: vi.fn(async () => jsonResponse({
        data: { model: { Total: 1, Balance: [{ ID: 9, Value: -1, PointsType: 9 }] } }
      }))
    });

    const result = await client.listBalanceRecords({ direction: 'all', page: 1, page_size: 20 }, session);

    expect(result.items[0]?.direction).toBe('unknown');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
```

- [ ] **Step 2: 运行测试并确认因 HTTP client 缺失而失败**

Run: `npm test -- tests/unit/http-balance-client.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../../src/balance/http-balance-client.js'`。

- [ ] **Step 3: 脱敏并纳入用户提供的外部契约**

在 `docs/external/余额流水.openapi.yaml` 中将 `Authorization` 的 `example` 和 `default` 都改为：

```yaml
tmcp_v1_test-id.test-secret
```

在 `docs/external/api-responses/余额流水api.json` 中将所有 `UserID` 值统一替换为明显虚构的：

```json
"00000000-0000-4000-8000-000000000001"
```

只替换敏感值，不修改 route、query 参数、字段名、金额、方向、分页总数或记录顺序。

- [ ] **Step 4: 实现最小 HTTP client 与受控映射**

创建 `src/balance/http-balance-client.ts`：

```typescript
import {
  BaseHttpClient,
  firstArray,
  firstObject,
  readInteger,
  readNumber,
  readString,
  unwrapPayload,
  type HttpClientOptions,
  type JsonObject
} from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type {
  BalanceClient,
  BalanceDirectionFilter,
  BalanceRecord,
  BalanceRecordDirection,
  ListBalanceRecordsInput,
  ListBalanceRecordsResult
} from './balance-client.js';

const POINTS_TYPE_BY_DIRECTION: Record<BalanceDirectionFilter, string> = {
  all: '0',
  income: '1',
  expense: '2'
};

export class HttpBalanceClient extends BaseHttpClient implements BalanceClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async listBalanceRecords(input: ListBalanceRecordsInput, session: StoredAuthSession): Promise<ListBalanceRecordsResult> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/balance/list', {
      pageindex: String(input.page),
      pagesize: String(input.page_size),
      pointstype: POINTS_TYPE_BY_DIRECTION[input.direction]
    }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall balance records'));
    const model = firstObject(payload, ['model']) ?? payload;
    const items = firstArray(model, ['Balance', 'items', 'list', 'records']).map(mapBalanceRecord);

    return {
      ...input,
      total: readInteger(model, ['Total', 'total', 'totalCount', 'count'], items.length),
      items
    };
  }
}

function mapBalanceRecord(source: JsonObject): BalanceRecord {
  return {
    id: readString(source, ['ID', 'id', 'recordId']),
    amount: readNumber(source, ['Value', 'amount']),
    formatted_amount: readString(source, ['ValueFormat', 'formattedAmount']),
    direction: mapRecordDirection(readInteger(source, ['PointsType', 'pointsType'])),
    type: readString(source, ['Type', 'type']),
    description: readString(source, ['Message', 'description']),
    order_id: readString(source, ['OrderID', 'orderId']),
    display_date: readString(source, ['CreateTime', 'displayDate']),
    created_at: readString(source, ['StayDate', 'createdAt'])
  };
}

function mapRecordDirection(pointsType: number): BalanceRecordDirection {
  if (pointsType === 1) return 'income';
  if (pointsType === 2) return 'expense';
  return 'unknown';
}
```

- [ ] **Step 5: 运行 HTTP client 测试并确认通过**

Run: `npm test -- tests/unit/http-balance-client.test.ts`

Expected: PASS，`5 tests passed`（参数化用例按 Vitest 展开计数）。

- [ ] **Step 6: 运行通用 WebApi 错误映射回归**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts tests/unit/http-balance-client.test.ts`

Expected: PASS，且无 PAT、上游正文或未处理异常输出。

- [ ] **Step 7: 提交 HTTP client 与已脱敏外部契约**

```bash
git add src/balance/http-balance-client.ts tests/unit/http-balance-client.test.ts docs/external/余额流水.openapi.yaml docs/external/api-responses/余额流水api.json
git commit -m "feat: add balance records WebApi client"
```

### Task 3: MCP tool schema 与 wrapper

**Files:**
- Create: `tests/unit/balance-tools.test.ts`
- Create: `src/tools/balance.ts`

- [ ] **Step 1: 写 schema、认证和摘要的失败测试**

创建 `tests/unit/balance-tools.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { FakeBalanceClient } from '../../src/balance/fake-balance-client.js';
import { ListBalanceRecordsInputSchema, listBalanceRecordsForMcp } from '../../src/tools/balance.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('balance records MCP tool', () => {
  it('applies defaults and validates direction and pagination', () => {
    expect(ListBalanceRecordsInputSchema.parse({})).toEqual({ direction: 'all', page: 1, page_size: 20 });
    expect(ListBalanceRecordsInputSchema.safeParse({ direction: 'credit' }).success).toBe(false);
    expect(ListBalanceRecordsInputSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(ListBalanceRecordsInputSchema.safeParse({ page_size: 51 }).success).toBe(false);
  });

  it('returns AUTH_REQUIRED without calling the balance client', async () => {
    const balanceClient = new FakeBalanceClient();
    const list = vi.spyOn(balanceClient, 'listBalanceRecords');

    const result = await listBalanceRecordsForMcp({}, { balanceClient });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
    expect(list).not.toHaveBeenCalled();
  });

  it('returns an AI-friendly summary and controlled structured content', async () => {
    const result = await listBalanceRecordsForMcp(
      { direction: 'income', page: 1, page_size: 10 },
      { authContext, balanceClient: new FakeBalanceClient() }
    );

    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('余额获取流水') })
    ]);
    expect(result.structuredContent).toMatchObject({ direction: 'income', page: 1, page_size: 10, total: 2 });
    expect(JSON.stringify(result)).not.toContain(pat);
    expect(JSON.stringify(result)).not.toContain('UserID');
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });
});
```

- [ ] **Step 2: 运行测试并确认因 tool 模块缺失而失败**

Run: `npm test -- tests/unit/balance-tools.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../../src/tools/balance.js'`。

- [ ] **Step 3: 实现 Zod schema、认证和摘要**

创建 `src/tools/balance.ts`：

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { toStoredAuthSession, type RequestAuthContext } from '../auth/request-auth-context.js';
import { FakeBalanceClient } from '../balance/fake-balance-client.js';
import type { BalanceClient } from '../balance/balance-client.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';

export const ListBalanceRecordsInputSchema = z.object({
  direction: z.enum(['all', 'income', 'expense']).default('all'),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(50).default(20)
});

const BalanceRecordSchema = z.object({
  id: z.string(),
  amount: z.number(),
  formatted_amount: z.string(),
  direction: z.enum(['income', 'expense', 'unknown']),
  type: z.string(),
  description: z.string(),
  order_id: z.string(),
  display_date: z.string(),
  created_at: z.string()
});

export const ListBalanceRecordsOutputSchema = z.object({
  direction: z.enum(['all', 'income', 'expense']),
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(BalanceRecordSchema)
});

export type ListBalanceRecordsInput = z.input<typeof ListBalanceRecordsInputSchema>;

export interface BalanceToolDependencies {
  authContext?: RequestAuthContext;
  balanceClient?: BalanceClient;
}

export async function listBalanceRecordsForMcp(
  input: ListBalanceRecordsInput,
  dependencies: BalanceToolDependencies
): Promise<CallToolResult> {
  const session = dependencies.authContext?.pat && toStoredAuthSession(dependencies.authContext);
  if (!session) {
    return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
  }

  const parsedInput = ListBalanceRecordsInputSchema.parse(input);
  const result = await (dependencies.balanceClient ?? new FakeBalanceClient()).listBalanceRecords(parsedInput, session);
  const label = result.direction === 'income' ? '余额获取' : result.direction === 'expense' ? '余额消耗' : '余额';

  return {
    content: [{ type: 'text', text: `找到 ${result.total} 条${label}流水，当前返回 ${result.items.length} 条。` }],
    structuredContent: { ...result }
  };
}
```

- [ ] **Step 4: 运行 tool 测试并确认通过**

Run: `npm test -- tests/unit/balance-tools.test.ts`

Expected: PASS，`3 tests passed`。

- [ ] **Step 5: 提交 MCP tool 领域逻辑**

```bash
git add src/tools/balance.ts tests/unit/balance-tools.test.ts
git commit -m "feat: add balance records MCP tool"
```

### Task 4: 应用装配与协议回归

**Files:**
- Modify: `src/app/client-factory.ts`
- Modify: `src/app/register-tools.ts`
- Modify: `src/server.ts`
- Modify: `tests/unit/client-factory.test.ts`
- Modify: `tests/unit/server.test.ts`
- Modify: `tests/integration/mcp-stdio.test.ts`
- Modify: `tests/integration/mcp-streamable-http.test.ts`

- [ ] **Step 1: 先扩展装配与注册测试**

在 `tests/unit/client-factory.test.ts` 导入 `FakeBalanceClient`、`HttpBalanceClient`，并分别在 fake/real 用例增加：

```typescript
expect(clients.balanceClient).toBeInstanceOf(FakeBalanceClient);
expect(clients.balanceClient).toBeInstanceOf(HttpBalanceClient);
```

将 `clients.balanceClient` 加入 real client 的 `timeoutMs` 检查数组。

在 `tests/unit/server.test.ts` 的 tool 名称数组加入：

```typescript
'tvcmall_list_balance_records'
```

并在只读描述用例加入：

```typescript
expect(registeredTools.tvcmall_list_balance_records.description).toContain('余额获取和消耗流水');
```

在 `tests/integration/mcp-stdio.test.ts` 的 `arrayContaining` 中加入：

```typescript
'tvcmall_list_balance_records'
```

- [ ] **Step 2: 增加真实 Streamable HTTP session 的失败测试**

在 `tests/integration/mcp-streamable-http.test.ts` 导入 `FakeBalanceClient`、`ListBalanceRecordsInputSchema`、`ListBalanceRecordsOutputSchema`、`listBalanceRecordsForMcp`，增加：

```typescript
it('calls the balance records tool through an authenticated Streamable HTTP session', async () => {
  const baseUrl = await startServer({
    createMcpServer(authContext) {
      const server = new McpServer({ name: 'balance-http-test', version: '1' });
      server.registerTool(
        'tvcmall_list_balance_records',
        {
          description: '分页查询当前客户的余额获取和消耗流水',
          inputSchema: ListBalanceRecordsInputSchema,
          outputSchema: ListBalanceRecordsOutputSchema
        },
        (input) => listBalanceRecordsForMcp(input, { authContext, balanceClient: new FakeBalanceClient() })
      );
      return server;
    }
  });
  const initialized = await initialize(baseUrl, FIRST_PAT);
  const sessionId = initialized.headers.get('mcp-session-id');

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: sessionHeaders(FIRST_PAT, sessionId!),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'tvcmall_list_balance_records', arguments: { direction: 'income' } }
    })
  });
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain('余额获取流水');
  expect(body).toContain('"direction":"income"');
  expect(body).not.toContain(FIRST_PAT);
  expect(body).not.toContain('UserID');
});
```

- [ ] **Step 3: 运行装配与协议测试并确认失败原因正确**

Run: `npm test -- tests/unit/client-factory.test.ts tests/unit/server.test.ts tests/integration/mcp-stdio.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: FAIL；`TvcMallClients` 尚无 `balanceClient`、tool 尚未注册，HTTP 调用测试尚无法导入或执行新 tool。

- [ ] **Step 4: 装配 fake/HTTP balance clients**

在 `src/app/client-factory.ts`：

```typescript
import type { BalanceClient } from '../balance/balance-client.js';
import { FakeBalanceClient } from '../balance/fake-balance-client.js';
import { HttpBalanceClient } from '../balance/http-balance-client.js';
```

向 `TvcMallClients` 增加：

```typescript
balanceClient: BalanceClient;
```

在 real 分支增加：

```typescript
balanceClient: new HttpBalanceClient({ baseUrl: config.webApiBaseUrl, timeoutMs: config.apiTimeoutMs }),
```

在 fake 分支增加：

```typescript
balanceClient: new FakeBalanceClient(),
```

- [ ] **Step 5: 注册新 tool**

在 `src/app/register-tools.ts` 导入 `BalanceClient` 以及 balance schemas/wrapper，向 `RegisterToolDependencies` 增加 `balanceClient: BalanceClient`，解构该依赖，并在积分 tools 后注册：

```typescript
server.registerTool(
  'tvcmall_list_balance_records',
  {
    title: 'TVCMall List Balance Records',
    description: '分页查询当前客户的余额获取和消耗流水；可使用 all、income、expense 筛选',
    inputSchema: ListBalanceRecordsInputSchema,
    outputSchema: ListBalanceRecordsOutputSchema
  },
  async (input) => handleToolCall(() => listBalanceRecordsForMcp(input, { authContext, balanceClient }))
);
```

- [ ] **Step 6: 贯通 server 注入**

在 `src/server.ts` 导入 `BalanceClient`，向 `ServerOptions` 增加：

```typescript
balanceClient?: BalanceClient;
```

在 `createTvcMallMcpServer` 中增加：

```typescript
const balanceClient = options.balanceClient ?? defaultClients.balanceClient;
```

并在 `registerTvcMallTools` 依赖对象中传入 `balanceClient`。

- [ ] **Step 7: 运行装配与协议测试并确认通过**

Run: `npm test -- tests/unit/client-factory.test.ts tests/unit/server.test.ts tests/integration/mcp-stdio.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: PASS；tool 可通过集中注册发现，并可在携带同一 PAT 的 Streamable HTTP session 中调用，响应不含 PAT 或 `UserID`。

- [ ] **Step 8: 提交应用装配**

```bash
git add src/app/client-factory.ts src/app/register-tools.ts src/server.ts tests/unit/client-factory.test.ts tests/unit/server.test.ts tests/integration/mcp-stdio.test.ts tests/integration/mcp-streamable-http.test.ts
git commit -m "feat: register balance records tool"
```

### Task 5: 当前文档契约

**Files:**
- Create: `tests/unit/balance-docs.test.ts`
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/harness.md`

- [ ] **Step 1: 写当前文档缺失余额 tool 的失败测试**

创建 `tests/unit/balance-docs.test.ts`：

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = ['README.md', 'docs/api-contract.md', 'docs/mvp-scope.md', 'docs/harness.md'];

describe('balance records documentation', () => {
  it.each(files)('%s documents the balance records tool without write capabilities', (path) => {
    const content = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

    expect(content).toContain('tvcmall_list_balance_records');
    expect(content).toContain('余额');
  });

  it('documents the direction to pointstype mapping in the API contract', () => {
    const contract = readFileSync(new URL('../../docs/api-contract.md', import.meta.url), 'utf8');

    expect(contract).toContain('`all` → `pointstype=0`');
    expect(contract).toContain('`income` → `pointstype=1`');
    expect(contract).toContain('`expense` → `pointstype=2`');
    expect(contract).toContain('`order.read`');
  });
});
```

- [ ] **Step 2: 运行文档测试并确认缺失契约导致失败**

Run: `npm test -- tests/unit/balance-docs.test.ts`

Expected: FAIL；四份当前文档尚未都包含 `tvcmall_list_balance_records`，API 契约尚无三个映射条目。

- [ ] **Step 3: 更新 README**

在 `README.md`：

- 当前能力描述改为“商品、订单、物流、运费、积分和余额流水只读查询”。
- 示例问题增加“查下余额流水”和“查看余额消耗流水”。
- Tools 表增加 `tvcmall_list_balance_records`，用途为分页查看余额获取/消耗流水，scope 为 `order.read`。
- 说明默认查全部，支持 `all`、`income`、`expense`，单页最大 `50`。

- [ ] **Step 4: 更新 API 契约**

在 `docs/api-contract.md` 的 tool 总览增加：

```markdown
| `tvcmall_list_balance_records` | `direction=all`、`page=1`、`page_size=20`（最大 50） | 筛选、分页、总数和余额流水摘要 | `order.read`；`GET /api/v3/user/balance/list` |
```

新增余额输入小节，明确：

```markdown
- `all` → `pointstype=0`：全部。
- `income` → `pointstype=1`：获取。
- `expense` → `pointstype=2`：消耗。
```

并记录输出不包含 `UserID`，记录未知 `PointsType` 映射为 `unknown`，不根据金额猜测方向。

- [ ] **Step 5: 更新 MVP 与 harness**

在 `docs/mvp-scope.md` 的核心场景、tool 范围、`order.read` 描述和验收标准中加入余额流水；保持充值、转移、抵扣等写操作在“不包含”范围。

在 `docs/harness.md` 的结构、fixtures、tool 开发流程和 WebApi client 测试段落加入 balance client/fixture，并明确真实响应测试使用脱敏外部样例但生产 fixture 不复制 `UserID`。

- [ ] **Step 6: 运行文档及范围回归测试**

Run: `npm test -- tests/unit/balance-docs.test.ts tests/unit/remote-readme.test.ts tests/unit/removed-export-capability.test.ts`

Expected: PASS；余额 tool 契约一致，原有远程接入和无导出能力约束保持通过。

- [ ] **Step 7: 提交当前文档更新**

```bash
git add README.md docs/api-contract.md docs/mvp-scope.md docs/harness.md tests/unit/balance-docs.test.ts
git commit -m "docs: document balance records tool"
```

### Task 6: 全量验证与交付检查

**Files:**
- Verify only; only fix files already in this plan if verification exposes a defect.

- [ ] **Step 1: 运行余额领域测试**

Run: `npm test -- tests/unit/fake-balance-client.test.ts tests/unit/http-balance-client.test.ts tests/unit/balance-tools.test.ts tests/unit/balance-docs.test.ts`

Expected: PASS，0 failures。

- [ ] **Step 2: 运行关键协议和安全回归**

Run: `npm test -- tests/unit/webapi-error-mapping.test.ts tests/unit/server.test.ts tests/unit/client-factory.test.ts tests/integration/mcp-stdio.test.ts tests/integration/mcp-streamable-http.test.ts`

Expected: PASS，0 failures，stdout/stderr 不含 PAT、`TVCMALL_API_KEY`、`Authorization` 或 `UserID`。

- [ ] **Step 3: 运行 TypeScript 类型检查**

Run: `npm run typecheck`

Expected: exit 0，无 TypeScript diagnostics。

- [ ] **Step 4: 运行生产构建**

Run: `npm run build`

Expected: exit 0，`dist/` 成功生成且无编译错误。

- [ ] **Step 5: 运行完整测试套件**

Run: `npm test`

Expected: exit 0，所有 Vitest test files 与 tests 通过。

- [ ] **Step 6: 检查 diff 与敏感字段**

Run: `git diff --check`

Expected: exit 0，无空白错误。

Run: `git status --short`

Expected: 只显示用户原有未提交的 `package.json`、`.codex/` 或经确认需要保留的计划外变更；本计划实现文件都已提交，两份余额外部文档已按 Task 2 脱敏并纳入该任务提交。若任一验证失败，回到受影响任务补一条能重现失败的测试，完成红绿循环后使用该任务列出的精确文件列表提交，再从 Step 1 重新执行完整验证。
