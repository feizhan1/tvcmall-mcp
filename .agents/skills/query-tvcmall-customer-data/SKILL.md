---
name: query-tvcmall-customer-data
description: Use when users ask to search TVCMall products, estimate shipping for unplaced items, or query orders, tracking, order freight, points, or balance records, including read-only requests that need multiple TVCMall MCP tools or safe handling of AUTH_REQUIRED, PERMISSION_DENIED, RATE_LIMITED, API_UNAVAILABLE, or PRODUCT_NOT_FOUND.
---

# 查询 TVCMall 客户数据

## 核心原则

只用已配置的 TVCMall MCP tools 获取业务事实。不要直接调用 WebApi，不要猜测缺失数据，不要执行下单、支付、取消订单、修改地址、积分兑换或文件导出。

## 通用流程

1. 识别用户意图，只追问当前 tool 缺少的必填参数。
2. 调用下表指定的 tool；组合请求按依赖顺序调用。
3. 先回答结论，再给必要摘要；不要无限翻页或直接相加不同币种。
4. 不输出原始 WebApi 响应，不恢复或推断已脱敏的电话、邮箱、地址等 PII。

| 意图 | Tool | 约束 |
| --- | --- | --- |
| 商品搜索 | `tvcmall_search_products` | 多项结果先让用户按标题或 SKU 确认，不要自行选择 |
| 商品详情 | `tvcmall_get_product_detail` | 只传搜索结果原样返回的 `product_id` |
| 未下单商品运费 | `tvcmall_estimate_shipping` | 收集 SKU、数量和两位国家代码 |
| 订单列表 | `tvcmall_list_orders` | 全部/待付款/待确认/备货中/已发货/已完成分别映射为 `V3All`/`V3Unpaid`/`V3AwaitingConfirmation`/`V3Preparing`/`V3Shipped`/`V3Done` |
| 订单商品、金额、收货信息 | `tvcmall_get_order_detail` | 已知 `order_id` 时使用 |
| 单个订单物流或订单运费 | `tvcmall_get_tracking_info` | 已下单运费不要使用商品运费试算 |
| 多个订单物流或订单运费 | `tvcmall_batch_get_tracking` | 当前结果最多传 50 个订单号 |
| 积分汇总 | `tvcmall_get_points` | 不要与积分流水或余额混淆 |
| 积分流水 | `tvcmall_list_point_records` | `direction` 使用 `all`、`got` 或 `used` |
| 余额流水 | `tvcmall_list_balance_records` | `direction` 使用 `all`、`income` 或 `expense` |

商品搜索无结果时停止；唯一结果且用户需要详情时才继续查询；多个结果必须先让用户确认。

“最近已发货订单的物流和运费”先调用 `tvcmall_list_orders(status=V3Shipped)`，再把当前结果中的订单号传给 `tvcmall_batch_get_tracking`。

## 认证与错误

- 不要求用户在对话中粘贴 PAT、`TVCMALL_API_KEY` 或 `Authorization`；提示在 MCP Client 的 secret 配置中设置凭据。
- `tvcmall_auth_status.configured=true` 只表示当前 session 已配置 PAT，不表示凭据有效、未过期或拥有 scope。
- `AUTH_REQUIRED`：提示配置或更新 PAT。
- `PERMISSION_DENIED`：说明可能缺少权限或 route allowlist，不要绕过。
- `RATE_LIMITED`：建议稍后重试。
- `API_UNAVAILABLE`：说明服务暂时不可用，不要编造结果。
- `PRODUCT_NOT_FOUND`：建议重新提供 SKU 或关键词。

## 输出

- 商品：标题、SKU、价格和必要摘要。
- 订单：订单号、状态、金额和日期。
- 物流：当前状态、承运商、运单号和最新轨迹。
- 只返回完成用户请求所需的信息，不输出认证信息或不必要的 PII。
