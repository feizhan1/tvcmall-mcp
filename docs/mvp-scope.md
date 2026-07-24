# TVCMall Customer MCP v0.1 MVP 范围

本文定义 TVCMall Customer MCP v0.1 的远程服务定位、能力范围、实施阶段、验收标准和主要风险。认证授权以根目录 `tvcmall-webapi mcp开发接入说明文档.md` 为准。

## 1. 项目定位

- 用户对象：TVCMall 客户、采购商、分销商和店铺运营人员。
- 使用方式：MCP Client 连接 TVCMall 托管的 HTTPS `/mcp` Streamable HTTP 服务。
- 认证方式：客户在 MCP Client 配置每用户 TVCMall PAT；每个请求发送 `TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}`，不兼容旧入站 `Authorization`。
- 第一版性质：远程、多 session、只读 MCP；不要求客户安装 Node.js、npm 包或登录 CLI。

## 2. 核心场景

- 选品：关键词搜索、商品详情。
- 费用预估：按 SKU、数量和目的国家/地区估算未下单商品运费。
- 订单：订单列表与详情。
- 履约：单个或批量查询物流，以及已下单订单的运费信息。
- 客户权益：积分汇总、积分记录与余额流水。

示例问题：

```text
帮我查找 TVCMall 上适合 iPhone 的手机壳
估算 SKU 100100 发往美国、数量 20 的运费
查询我最近 10 个订单
批量查询这些订单的物流状态
查询订单 V24011000008 的物流和运费
查看我的积分余额
查下余额流水
```

## 3. 已确定架构

```text
MCP Client
  -> HTTPS /mcp Streamable HTTP + 每请求 TVCMALL_API_KEY
Remote TVCMall MCP Server
  -> PAT 基本格式 / session 指纹 / schema / error mapping
Existing TVCMall WebApi routes + Authorization: Bearer 同一 PAT
  -> WebApi / ApplicationServices / RDS 完成 PAT 与 route-scope 授权
```

关键边界：

- MCP Server 不接收网站用户名或密码，不实现 OAuth，不配置服务器共享 PAT。
- MCP Server 不调用独立验证接口、不换 token、不解析用户、scopes 或 expiry。
- MCP Server 不直连 ApplicationServices 或 RDS，也不新增 MCP 专用业务 route。
- WebApi 使用 `catalog.read`、`order.read` 和 method + normalized route allowlist 做最终授权。
- PAT 仅在当前 MCP session 内存中保存；session 删除、关闭、空闲过期或 server close 后清理。

## 4. v0.1 能力范围

### 包含

| Tool | 能力 | 限制 |
| --- | --- | --- |
| `tvcmall_auth_status` | 报告当前 session 是否配置 PAT | 只返回 `{ configured: boolean }`，不验证 PAT |
| `tvcmall_search_products` | 按 SKU 或关键词搜索商品 | 分页，单页最多 50 条；`product_id` 来自 `data.Products[].Url`，仅当前 `items` 一项可查询详情，多项先按标题或 SKU 确认 |
| `tvcmall_get_product_detail` | 使用搜索结果的 `product_id` 查看商品详情 | `product_id` 仅接受 `/details/...` 相对详情路径，且必须取自 `tvcmall_search_products` 返回项（即 `data.Products[].Url`，如 `/details/example-product-sku123.html`）；拒绝 SKU、关键词、内部商品 ID；返回摘要和结构化详情 |
| `tvcmall_estimate_shipping` | 估算未下单商品运费 | SKU、数量最多 1000、两位国家/地区代码 |
| `tvcmall_list_orders` | 查询订单列表 | 日期/状态筛选，单页最多 50 条 |
| `tvcmall_get_order_detail` | 查看订单详情 | 地址等 PII 服从后端脱敏 |
| `tvcmall_get_tracking_info` | 查询单个订单物流和运费 | 订单号必填 |
| `tvcmall_batch_get_tracking` | 批量查询物流 | 每次最多 50 个订单号 |
| `tvcmall_get_points` | 查询积分汇总 | 只读 |
| `tvcmall_list_point_records` | 查询积分记录 | 分页，单页最多 50 条；`/api/v3/user/points/list` 投产前需登记 `order.read` allowlist |
| `tvcmall_list_balance_records` | 查询余额获取和消耗流水 | 分页，单页最多 50 条；支持全部、获取、消耗筛选 |

### 不包含

- 下单、支付、修改或取消订单。
- 修改地址、设置运输方式、积分兑换等写操作。
- 文件生成或下载型能力。
- 分类导航和未在本期 WebApi allowlist 中启用的接口。
- PAT 发放、撤销和管理界面；它们属于 TVCMall 后端与运营能力。

## 5. 授权范围

- `catalog.read`：商品搜索、商品详情、未下单商品运费估算。
- `order.read`：订单列表、订单详情、物流、已下单订单运费、积分和余额流水。

授权不在 MCP tool 层模拟。目标 WebApi route 未登记、被禁用或 PAT scope 不足时，WebApi 返回 `403`，MCP 映射为 `PERMISSION_DENIED`。

## 6. 实施阶段

### 阶段 0：契约与安全边界

- 以权威接入说明确认 PAT 格式、现有 WebApi routes、scope 与 allowlist。
- 确认生产域名、TLS 终止、日志脱敏、限流和 PII 策略。
- 维护 `docs/api-contract.md` 与技术架构图、数据流转图。

### 阶段 1：远程 HTTP 与 session

- 使用 MCP SDK `StreamableHTTPServerTransport` 提供 `POST` / `GET` / `DELETE /mcp`。
- 初始化时校验 `TVCMALL_API_KEY` 中的 PAT 基本格式并创建 session；拒绝入站 `Authorization`。
- 使用 SHA-256 指纹绑定 `Mcp-Session-Id`，拒绝在既有 session 替换 PAT。
- 实现最大 session 数、idle TTL、transport `onclose` 和 server close 清理。

### 阶段 2：WebApi PAT 透传

- 配置 `TVCMALL_API_ENV`、`TVCMALL_WEBAPI_BASE_URL` 和 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP`：`HTTPS` 始终可用；开关默认 `false`，仅 `value?.trim() === 'true'` 时启用 HTTP 覆盖。开关关闭时，只有显式 `sandbox` 可连接 loopback 或 RFC1918 的 HTTP WebApi；严格设为 `true` 后，`production`、`staging`、`sandbox` 及其他环境均可使用任意 host/port 的 HTTP WebApi。HTTP 会以明文传输 PAT、请求和响应，只能用于受控网络的临时调试；URL 始终拒绝 userinfo、query 和 fragment。
- 出站 HTTP 覆盖不降低 MCP Client 到 `/mcp` 的 HTTPS/TLS 要求、PAT 仅在当前 session 内存并在关闭路径清理的生命周期规则，或日志、异常和 tool 输出的强制脱敏。
- 所有真实业务 client 使用 session 中的同一 PAT，只添加一次 `Bearer `。
- 对接现有商品、订单、物流、运费、积分和余额流水 routes。
- 统一映射 WebApi 状态、网络、超时与正文读取错误。

### 阶段 3：只读 Tools

- 对所有输入做 Zod 校验，限制分页、批量和数量。
- 返回 AI 友好摘要与受控 structured content。
- 确认 `tvcmall_auth_status` 只有 configured 语义。
- 验证 tool 层不做本地 scope 决策，最终授权始终由 WebApi 完成。

### 阶段 4：集成、部署与灰度

- 使用伪 PAT 和 stub WebApi 完成自动化 HTTP 集成测试。
- 在受控 staging 使用 secret 注入执行真实 WebApi smoke test。
- 部署到 TLS 终止层后，关闭入站 `TVCMALL_API_KEY` 与出站 `Authorization` 日志并配置告警。
- 先对少量 PAT 灰度，观察 401/403/429/5xx、session 容量和延迟。

## 7. 验收标准

MVP 完成标准：

1. MCP Client 仅配置远程 URL 与 PAT 即可完成 `initialize`、`tools/list` 和 `tools/call`。
2. 缺失、带 `Bearer ` 前缀或基本格式错误的 `TVCMALL_API_KEY`，以及旧入站 `Authorization`，均返回 `401 AUTH_REQUIRED`，且响应与日志不含 PAT。
3. 同一 `Mcp-Session-Id` 只能使用初始化时的 PAT；不同 session 不共享认证上下文。
4. MCP 以相同 PAT 调用现有 WebApi route，不新增专用业务 route，也不访问 ApplicationServices/RDS。
5. 商品、订单、物流、运费、积分和余额流水的只读 tools 返回摘要与 schema 约束结果。
6. `catalog.read` / `order.read` 和 route allowlist 由 WebApi 后端执行；MCP 不在本地推断授权。
7. WebApi `401` / `403` / `429` / `5xx` 及网络、超时、正文读取失败映射为稳定错误码。
8. `DELETE /mcp`、transport `onclose`、idle TTL 和 server close 都会释放 session 中的 PAT 与指纹。
9. `TVCMALL_WEBAPI_BASE_URL` 缺失、包含 userinfo/query/fragment 时拒绝启动；`TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`，开关关闭时 HTTP 仅允许显式 `sandbox` 的 loopback/RFC1918 host，且仅 `value?.trim() === 'true'` 时允许 `production`、`staging`、`sandbox` 及其他环境使用任意 host/port 的 HTTP。该明文 PAT、请求和响应链路仅可用于受控网络的临时调试，并不降低 `/mcp` HTTPS/TLS、PAT session 内存生命周期或日志强制脱敏。
10. 项目不开放写操作，也不提供文件导出能力。

## 8. 主要风险与缓解

| 风险 | 缓解 |
| --- | --- |
| PAT 泄漏 | 客户端 secret 管理；代理与应用不记录 `TVCMALL_API_KEY` 或出站 `Authorization`；错误、tool 输出和 fixtures 禁止出现真实 PAT |
| session 混淆 | 每 session 独立 transport/Server；PAT SHA-256 指纹绑定；容量和 idle TTL |
| MCP 误判权限 | MCP 不解析 scopes；所有业务请求交给 WebApi route-scope 授权 |
| route 配置漂移 | 新 tool 上线前核对 HTTP method、normalized route、scope 与 allowlist enabled 状态 |
| WebApi 故障被误报认证错误 | 仅 `401` 映射认证；`5xx`、网络、超时和正文读取失败统一映射 `API_UNAVAILABLE` |
| PII 经 AI 扩散 | 后端先授权与脱敏；tool 只返回任务必要摘要，避免透传完整响应 |
| 客户端实现差异 | 分别验证主流 MCP Client 的自定义 header、Streamable HTTP 与 session header 支持 |
| 服务重启丢失 session | session 仅内存是安全要求；客户端收到 `SESSION_NOT_FOUND` 后重新 initialize |
| WebApi HTTP 误连或明文泄漏 | 默认只允许显式 `sandbox` 的 loopback/RFC1918 host；仅严格设为 `true` 的 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 可在任意环境、任意 host/port 使用 HTTP。明文 PAT、请求和响应风险由部署人员承担，只能用于受控网络和临时调试 |

## 9. 上线前决策

- 确认生产 MCP URL、WebApi base URL 和 TLS/反向代理拓扑。
- 确认初始 route allowlist 与 `catalog.read` / `order.read` 的 PAT 发放策略。
- 确认 session 最大容量、idle TTL、请求超时和限流阈值。
- 确认日志字段白名单、PAT 泄漏响应流程和 staging smoke test 责任人。
