# 订单列表 WebApi 状态筛选设计

## 目标

让 `tvcmall_list_orders` 的 MCP 入参 `status` 直接使用 TVCMall WebApi `POST /v3/user/getorders` 所需的 6 个筛选值，并让模型能依据用户的订单状态诉求选择正确值。

## MCP 输入契约

`status` 仅接受以下值，未提供时默认 `V3All`：

| 用户意图 | `status` |
| --- | --- |
| 全部订单或未指定状态 | `V3All` |
| 待付款、未付款 | `V3Unpaid` |
| 待确认 | `V3AwaitingConfirmation` |
| 备货中、准备中 | `V3Preparing` |
| 已发货、运输中 | `V3Shipped` |
| 已完成 | `V3Done` |

工具注册描述与 `status` schema 字段描述都必须包含这组映射，供 MCP Client 模型选择参数。HTTP client 将该值原样写入 WebApi 请求体；不得再使用旧的 `All`、`pending`、`processing`、`shipped`、`delivered` 或 `cancelled` 作为查询筛选值。

## 保持不变的契约

- 订单列表和订单详情输出中的 `status` 继续使用当前受控的摘要状态：`pending`、`processing`、`shipped`、`delivered`、`cancelled`。
- `OrderStatus` 继续只表达从 WebApi 响应映射出来的输出状态；新增独立的列表筛选状态类型，避免把请求筛选值与响应展示值混淆。
- `start_date`、`end_date`、分页、订单详情、物流、鉴权、WebApi route 和错误映射均不改变。

## 实现边界

1. 在订单领域新增 `OrderListStatusFilter`，并让 `ListOrdersInput.status` 始终为该类型。
2. `ListOrdersInputSchema` 使用对应 Zod enum，默认 `V3All`，并提供包含意图映射的字段描述。
3. `HttpOrderClient` 将 `input.status` 原样发送为请求 body 的 `status`。
4. Fake order client 接受新筛选类型；fixture 无法精确表示某个 WebApi 筛选类目时，不将旧输出状态错误映射到新筛选值。
5. 更新工具描述、API 契约和单元测试。

## 测试与验收

- schema 接受全部 6 个 WebApi 值，并在缺失时补齐 `V3All`。
- schema 拒绝旧筛选值和其他未知值。
- HTTP client 针对每个 6 个值都原样发送 JSON body `status`，并验证默认调用发送 `V3All`。
- 工具注册描述和 schema 描述包含用户意图到 WebApi 值的映射。
- 订单结果仍可输出现有 5 个受控摘要状态。
- 相关单元测试、完整测试、typecheck、build 与 `git diff --check` 通过。
