# 余额流水 MCP Tool 设计

## 目标

新增只读 MCP tool `tvcmall_list_balance_records`，支持用户通过“查下余额流水”等自然语言请求分页查看余额获取、消耗记录。tool 复用现有 TVCMall WebApi `GET /v3/user/balance/list`，不新增业务 route，不提供余额充值、转移、抵扣或其他写操作。

目标 route 已在 `order.read` allowlist 中：

```text
GET api/v3/user/balance/list
```

## MCP 契约

输入 schema：

```json
{
  "direction": "all",
  "page": 1,
  "page_size": 20
}
```

- `direction` 可选值为 `all`、`income`、`expense`，默认 `all`。
- `page` 为大于等于 `1` 的整数，默认 `1`。
- `page_size` 为 `1..50` 的整数，默认 `20`。

`direction` 与 WebApi `pointstype` 的映射固定为：

| MCP `direction` | WebApi `pointstype` | 业务含义 |
| --- | --- | --- |
| `all` | `0` | 全部流水 |
| `income` | `1` | 获取余额 |
| `expense` | `2` | 消耗余额 |

成功输出包含简短文本摘要和以下 `structuredContent`：

```json
{
  "direction": "all",
  "page": 1,
  "page_size": 20,
  "total": 398,
  "items": [
    {
      "id": "113764",
      "amount": 94.16,
      "formatted_amount": "$94.16",
      "direction": "income",
      "type": "WaitUseBalanceToOrder-Revoked",
      "description": "(Revoked)Wait For UseBalanceToOrder",
      "order_id": "V26071500020",
      "display_date": "07/15/2026",
      "created_at": "2026-07-15 11:21:14"
    }
  ]
}
```

顶层 `direction` 回显本次请求筛选，只允许 `all`、`income`、`expense`。单条记录的 `direction` 允许 `income`、`expense`、`unknown`，根据 WebApi `PointsType` 映射：`1` 为 `income`，`2` 为 `expense`。若 WebApi 返回未定义值，使用 `unknown`，不得根据金额正负猜测类型。`display_date` 对应 `CreateTime`，`created_at` 对应精确到秒的 `StayDate`。

WebApi 响应中的 `UserID` 不进入领域对象、tool 输出、日志或 fixture。tool 不声称返回当前可用余额，因为该 endpoint 只提供流水总数和记录列表。

## 组件与职责

新增独立 `balance` 领域，保持与现有商品、订单、积分等 client 分层一致：

```text
src/balance/
  balance-client.ts       # 输入、结果和 BalanceClient interface
  http-balance-client.ts  # WebApi 请求与受控字段映射
  fake-balance-client.ts  # fixture 驱动的本地/测试实现
src/fixtures/
  balance.ts              # 完全虚构、无 PII 的余额流水样本
src/tools/
  balance.ts              # Zod schemas、认证检查、摘要与 tool wrapper
```

`src/app/client-factory.ts` 负责装配 fake/HTTP client，`src/app/register-tools.ts` 只负责注册 tool。现有 transport、session、PAT 指纹和通用 WebApi 错误处理不承载余额业务逻辑。

不把余额流水并入 `points` 领域。余额和积分虽然都使用 `order.read`，但金额字段、方向语义、route 和响应结构不同，独立 client 能避免接口耦合并使测试边界清楚。

## 数据流

1. MCP Client 调用 `tvcmall_list_balance_records`。
2. Zod 校验并补齐 `direction`、`page`、`page_size` 默认值。
3. tool 从当前 MCP session 获取 PAT；缺失时返回 `AUTH_REQUIRED`。
4. HTTP client 将 `direction` 映射为 `pointstype`，请求：

   ```text
   GET /v3/user/balance/list?pageindex=1&pagesize=20&pointstype=0
   ```

5. HTTP client 只向配置的 `TVCMALL_WEBAPI_BASE_URL` 发送 `Authorization: Bearer <PAT>`，并只添加一次 `Bearer `。
6. client 从 `data.model.Total` 和 `data.model.Balance` 映射受控领域结果。
7. tool 返回当前筛选、分页信息、短文本摘要和结构化流水，不返回原始 WebApi body。

## 错误与安全边界

- WebApi `401` 映射为 `AUTH_REQUIRED`。
- WebApi `403` 映射为 `PERMISSION_DENIED`。
- WebApi `429` 映射为 `RATE_LIMITED`。
- WebApi `5xx`、网络、超时或正文读取失败映射为 `API_UNAVAILABLE`。
- tool 不在 MCP 侧判断 PAT scope、用户身份或 allowlist 状态。
- PAT、入站 `TVCMALL_API_KEY`、下游 `Authorization`、`UserID` 和原始错误正文不得进入日志、异常、tool 输出或测试快照。
- 分页只返回请求页，不自动抓取全部 398 条或其他无限数据。
- fixture 使用虚构记录、订单号和金额，不复制新响应样例中的用户标识或真实业务记录。

## 注册与文档

`registerTvcMallTools` 注册：

```text
name: tvcmall_list_balance_records
title: TVCMall List Balance Records
description: 分页查询当前客户的余额获取和消耗流水；支持 all、income、expense 筛选
scope: order.read
```

同步维护：

- `README.md`：自然语言示例和 Tools 表。
- `docs/api-contract.md`：tool 总览、输入、输出和 route 契约。
- `docs/harness.md`：新增 balance client/fixture 测试边界。
- `docs/mvp-scope.md`：将余额流水纳入 v0.1 只读能力与验收范围。

## 测试与验收

按测试先行实现，覆盖：

1. 输入 schema 为 `direction`、`page`、`page_size` 设置默认值，并拒绝非法方向、页码和超过 `50` 的 page size。
2. `all`、`income`、`expense` 分别生成 `pointstype=0`、`1`、`2`。
3. HTTP client 使用 `GET /v3/user/balance/list`，正确发送 `pageindex`、`pagesize`，并使用当前 session PAT 且只添加一次 `Bearer `。
4. `docs/external/api-responses/余额流水api.json` 可映射为 `total=398`、20 条受控记录；首条方向、金额、订单号和时间字段符合契约。
5. 映射结果不包含 `UserID`，tool 结果不包含 PAT、`TVCMALL_API_KEY` 或 `Authorization`。
6. 缺少 session 认证上下文时返回稳定 `AUTH_REQUIRED`，不调用 balance client。
7. fake client 支持筛选与分页，输出只使用虚构 fixture。
8. client factory 在 fake/real 数据源下分别装配 `FakeBalanceClient` 与 `HttpBalanceClient`，并透传 base URL 和 timeout。
9. `tools/list` 包含新 tool，Streamable HTTP session 可调用该 tool；现有只读工具和 HTTP session 生命周期行为保持不变。
10. WebApi 通用 `401`、`403`、`429`、`5xx`、网络、超时和 body read failure 错误映射回归通过。
11. README、API 契约、MVP 和 harness 文档与实现一致。
12. 相关 unit/integration tests、完整测试、typecheck、build 与 `git diff --check` 通过。
