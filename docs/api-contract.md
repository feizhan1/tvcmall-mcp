# TVCMall Customer MCP v0.1 API 契约

本文定义远程 Streamable HTTP MCP 的 API KEY/PAT header、session、MCP tools、现有 TVCMall WebApi routes、scope/allowlist、输出摘要和稳定错误码。WebApi 授权实现以根目录 `tvcmall-webapi mcp开发接入说明文档.md` 为准。

## 1. 契约原则

- MCP Client 在每个 `/mcp` 请求发送 `TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}`；入站 `Authorization` 不受支持。
- MCP HTTP 层只校验 API KEY/PAT 基本格式、请求 schema、session 指纹、容量与 idle TTL。
- MCP 不向其他认证服务预验证 PAT、不换 token、不解析用户、scopes 或 expiry。
- MCP 调用业务接口时使用当前 session 的同一 PAT，只添加一次 `Bearer `。
- TVCMall WebApi → ApplicationServices → RDS 是唯一业务授权链，负责 PAT verifier、`catalog.read` / `order.read` 和 method + normalized route allowlist。
- MCP 不直连 ApplicationServices/RDS，不新增 `/api/mcp/v1/...` 业务 routes，不使用网站用户名密码、OAuth 或服务器共享 PAT。
- v0.1 只读，不提供文件导出能力，不开放改变 TVCMall 业务状态的接口。

## 2. Streamable HTTP 接口

### 2.1 Endpoints

| Method | Path | 用途 | 认证/session 要求 |
| --- | --- | --- | --- |
| `POST` | `/mcp` | `initialize`、`tools/list`、`tools/call` 等 MCP JSON-RPC | 每请求 `TVCMALL_API_KEY`；初始化后还需 `Mcp-Session-Id` |
| `GET` | `/mcp` | SDK 支持的流式恢复/SSE | `TVCMALL_API_KEY` + `Mcp-Session-Id` |
| `DELETE` | `/mcp` | 终止 session | `TVCMALL_API_KEY` + `Mcp-Session-Id` |
| `GET` | `/healthz` | 存活检查 | 不返回配置、session 或身份信息 |

除 `/healthz` 外，所有 `/mcp` 请求都必须携带 PAT。没有 session ID 的非 initialize 请求返回安全的 session/initialize 错误，不创建隐式 session。

### 2.2 TVCMALL_API_KEY header

```http
TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}
```

要求：

- Header 值直接是 PAT，不带 `Bearer ` 前缀。
- PAT 必须以 `tmcp_v1_` 开头，并包含非空 `{tokenId}` 与 `{secret}` 两段。
- token 不能包含空白，不能是网站登录 token。
- 基本格式通过只代表请求可建立 MCP session，不代表 PAT 已被 WebApi 验证。
- 客户端必须在后续 `POST`、`GET`、`DELETE` 请求重复发送同一 PAT。
- 仅发送旧入站 `Authorization: Bearer ...`，或同时发送 `TVCMALL_API_KEY` 与 `Authorization`，都返回 `401 AUTH_REQUIRED`。

### 2.3 内容协商

典型请求头：

```http
Content-Type: application/json
Accept: application/json, text/event-stream
```

JSON-RPC 正文必须符合 MCP SDK 当前协商的 protocol version 与 schema。非法 JSON、超限正文或 schema 错误不得触发业务调用。

## 3. Session 契约

### 3.1 创建

1. 客户端发送无 `Mcp-Session-Id` 的 `POST /mcp initialize` 与 PAT。
2. MCP 校验 header 与 initialize schema，为 PAT 生成 SHA-256 指纹。
3. MCP 创建独立 `McpServer`、`StreamableHTTPServerTransport` 和 session 内存认证上下文。
4. 成功响应 header 返回 `Mcp-Session-Id`。

初始化不调用 WebApi。原始 PAT 与指纹都不得写入日志或持久层。

### 3.2 后续请求

```http
Mcp-Session-Id: {session-id}
TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}
```

- session ID 必须存在，PAT 的 SHA-256 指纹必须与初始化时一致。
- 指纹不一致返回 `401 AUTH_REQUIRED`，不说明 session 归属。
- 未知或已清理 session 返回 `404 SESSION_NOT_FOUND`。
- active request 结束后刷新 idle TTL；active request 期间不得被空闲清理。
- 最大 session 数必须同时计入已建立 session 和并发初始化，避免容量竞态。

### 3.3 清理

以下事件都必须关闭 transport/MCP Server 并删除 session 中的原始 PAT、指纹与引用：

- 客户端成功 `DELETE /mcp`。
- transport `onclose`。
- idle TTL 到期。
- initialize 失败或初始化响应未成功建立 session。
- server close / 进程优雅退出。

session 不跨进程恢复。多副本部署需使用 session affinity；实例丢失后客户端重新 initialize。

## 4. PAT 透传与 WebApi 授权

### 4.1 下游请求

MCP Server 从当前 session 读取原始 PAT，并调用 `TVCMALL_WEBAPI_BASE_URL` 下的现有 route：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
Accept: application/json
```

MCP 必须防止 `Bearer Bearer ...`，不得把 PAT 发送到日志、redirect 目标、第三方服务、ApplicationServices 地址或 RDS。

### 4.1.1 授权诊断关联

每次 WebApi 请求都由 MCP 生成一个不从 PAT、session、客户信息或请求参数派生的 UUID `traceId`，并附加以下仅用于观测的 header：

```http
X-TVCMall-MCP-Client: tvcmall-mcp-server
X-TVCMall-MCP-Trace-Id: {uuid}
```

这两个 header 不参与 PAT 校验、scope 判断或 method + normalized route allowlist，WebApi/ApplicationServices 必须将 `X-TVCMall-MCP-Trace-Id` 与安全的授权决策日志关联。该审计日志可记录 trace ID、HTTP method、normalized route、HTTP status 和拒绝分类，但不得记录 PAT、`Authorization`、请求参数、完整 URL/query、响应正文或 PII。

对于 MCP PAT 的 `403`，WebApi 可选返回以下 response header：

```http
X-TVCMall-MCP-Auth-Reason: scope_missing | route_not_registered | route_disabled
```

| 值 | 含义 |
| --- | --- |
| `scope_missing` | PAT 不具备该 route 所要求的 scope |
| `route_not_registered` | method + normalized route 未登记到 allowlist |
| `route_disabled` | route 已登记但 `enabled=0` |

MCP 的稳定 tool 错误码只依赖 HTTP status 和这个单一 response header；失败 response body 不进入 `WebApiRequestError`、MCP tool 输出或 `mcp_tool_completed`。为排障，MCP 会读取 response body 并仅将强制脱敏、截断后的快照写入 `mcp_webapi_request_completed.webApiResponseBody`。header 缺失或未知值时省略 `authReason`，并通过 trace ID 查询 WebApi/ApplicationServices 审计日志。该可选 header 只帮助诊断，绝不改变 WebApi 的授权决定或 MCP tool 的稳定错误码。

远程 HTTP 服务对每次下游业务 WebApi 请求写入一条 `mcp_webapi_request_completed`。事件包含 trace、method、normalized route、HTTP status、耗时；失败事件额外包含稳定错误码及 `webApiFailurePhase`。同时记录 `webApiRequestQuery`、`webApiRequestHeaders`、`webApiRequestBody`、`webApiResponseHeaders`、`webApiResponseBody`；`webApiRequestBodyBytes`、`webApiResponseBodyBytes`、`webApiRequestBodyTruncated`、`webApiResponseBodyTruncated` 和 `webApiResponseBodyState` 描述 payload 完整性。每个 body 快照最多 16 KiB UTF-8，并在强制脱敏后截断。对 `403`，`authReasonState=accepted` 表示已接受白名单原因，`missing` 表示未返回 header，`unrecognized` 表示返回值不在白名单。事件不记录原始未脱敏 header/query/body、host、userinfo、PAT、`Authorization`、session 或 PII。

### 4.1.2 WebApi 传输环境

`TVCMALL_API_ENV` 可为 `production`、`staging` 或 `sandbox`；未设置或非法值回退为 `production`。`HTTPS` 在所有合法环境中允许，而 `production`、`staging` 及回退的 `production` 必须使用 HTTPS WebApi URL。

只有显式 `sandbox` 可使用 `http://`，且 hostname 只能是 `localhost`、`[::1]`、`127.0.0.0/8` 或 RFC1918 地址段：`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`。校验只使用 URL hostname，不进行 DNS 解析；普通 hostname、公网 IP、link-local `169.254.0.0/16`、CGNAT `100.64.0.0/10` 和非 loopback IPv6 均被拒绝。无论环境如何，base URL 都不得含 userinfo、query 或 fragment。

sandbox HTTP 仅用于隔离网络的本地联调，并且只可使用可撤销的测试 PAT；它不改变 MCP Client 到公网 `/mcp` 的 HTTPS/TLS 要求，也不能用于生产客户 PAT。

### 4.2 WebApi 授权链

1. WebApi 认证过滤器优先识别 `tmcp_v1_` PAT。
2. WebApi 调用 ApplicationServices 校验 PAT 与当前 HTTP method、URL。
3. ApplicationServices 从 RDS 查询 PAT 元数据/verifier/scopes 和 route-scope allowlist。
4. WebApi/ApplicationServices 将 trace ID 与授权决策安全关联；授权成功后 WebApi 建立请求用户上下文、移除 `Authorization`，再执行原有业务 action。
5. 授权失败不进入业务 action，WebApi 返回 `401` 或 `403`。

RDS 不保存 PAT 明文 secret。MCP 既不保存 verifier，也不能绕过此链路。

### 4.3 Scope 与 route normalization

```text
UPPERCASE_HTTP_METHOD + normalized_route -> required_scope
```

`normalized_route` 规则：

- 绝对 URL 只保留 path。
- 去掉 query string。
- 去掉首尾 `/`。
- path 转为小写。

示例：

| 原始请求 | 授权匹配键 |
| --- | --- |
| `GET https://webapi.example.com/api/v3/product/list/search/mapping?keywords=iphone` | `GET + api/v3/product/list/search/mapping` |
| `POST /api/v3/user/getorders` | `POST + api/v3/user/getorders` |
| `GET /api/order/getlogisticstracking?orderId=123` | `GET + api/order/getlogisticstracking` |

route 未登记、`enabled=0` 或 PAT 缺少 required scope 均返回 `403`。MCP 本地 tool 是否存在不影响授权结果。MCP 失败日志中的 `normalizedRoute` 使用同一规则，不记录完整 URL 或 query。

## 5. 本期 WebApi route allowlist

以下表来自权威接入说明。V3 route 优先；物流当前无 V3，复用现有旧 route。

### 5.1 `catalog.read`

| Method | normalized_route | 用途 |
| --- | --- | --- |
| `POST` | `api/v3/product/list/search/image/mapping` | PC 以图搜图 |
| `POST` | `api/m/v3/product/list/search/image/mapping` | Mobile 以图搜图 |
| `GET` | `api/v3/product/list/search/mapping` | PC 关键词搜索 |
| `GET` | `api/m/v3/product/list/search/mapping` | Mobile 关键词搜索 |
| `GET` | `api/v3/productdetail/detail` | PC 商品详情 |
| `GET` | `api/m/v3/productdetail/detail` | Mobile 商品详情 |
| `GET` | `api/v3/productdetail/shipping/compute` | PC 运费试算 |
| `GET` | `api/m/v3/productdetail/shipping/compute` | Mobile 运费试算 |

### 5.2 `order.read`

| Method | normalized_route | 用途 |
| --- | --- | --- |
| `POST` | `api/v3/user/getorders` | PC 订单列表 |
| `POST` | `api/m/v3/user/getorders` | Mobile 订单列表 |
| `POST` | `api/v3/order/detail` | PC 订单详情 |
| `POST` | `api/m/v3/order/detail` | Mobile 订单详情 |
| `POST` | `api/v3/order/detail/page` | PC 订单商品分页 |
| `POST` | `api/m/v3/order/detail/page` | Mobile 订单商品分页 |
| `GET` | `api/order/getlogisticstracking` | PC 订单物流；无 V3 |
| `GET` | `api/m/order/getlogisticstracking` | Mobile 订单物流；无 V3 |
| `GET` | `api/v3/user/points/stat` | PC 积分汇总 |
| `GET` | `api/m/v3/user/points/stat` | Mobile 积分汇总 |
| `GET` | `api/v3/user/balance/list` | PC 余额流水 |
| `GET` | `api/m/v3/user/balance/list` | Mobile 余额流水 |

当前 tool 实现的积分记录 client 使用 `GET /api/v3/user/points/list`。该 tool 投产前必须由 WebApi/ApplicationServices 团队确认该 method + normalized route 已登记到 `order.read` allowlist；未登记时应保持 `403 PERMISSION_DENIED`，不得由 MCP 绕过。

新增或修改 tool 前必须同时核对 route、method、请求/响应 schema、scope 与 allowlist enabled 状态。

## 6. MCP Tools

### 6.1 总览

| Tool | 输入摘要 | 输出摘要 | Scope / route |
| --- | --- | --- | --- |
| `tvcmall_auth_status` | `{}` | `{ configured: boolean }` | 不调用 WebApi |
| `tvcmall_search_products` | `query`、`page=1`、`page_size=20`（最大 50） | 查询词、分页、总数、商品摘要列表 | `catalog.read`；商品搜索 route |
| `tvcmall_get_product_detail` | `product_id` | SKU、标题、价格、库存、MOQ、尺寸、属性、图片 | `catalog.read`；商品详情 route |
| `tvcmall_estimate_shipping` | `sku`、`quantity`（1..1000）、两位 `countrycode` | 目的地、计费重量、币种、运输方案摘要 | `catalog.read`；运费试算 route |
| `tvcmall_list_orders` | 可选日期/状态、`page=1`、`page_size=20`（最大 50） | 分页、总数、订单号/状态/金额摘要 | `order.read`；订单列表 route |
| `tvcmall_get_order_detail` | `order_id` | 商品、金额和后端脱敏后的收货信息 | `order.read`；订单详情 route |
| `tvcmall_get_tracking_info` | `order_id` | 承运商、单号、状态、事件和可用的订单运费 | `order.read`；物流 route |
| `tvcmall_batch_get_tracking` | `order_ids`（1..50） | 命中数量和物流摘要列表 | `order.read`；逐个调用物流 route |
| `tvcmall_get_points` | `{}` | 可用/待生效/累计获得/累计使用积分 | `order.read`；积分汇总 route |
| `tvcmall_list_point_records` | `page=1`、`page_size=20`（最大 50） | 分页、总数和积分记录摘要 | `order.read`；积分记录 route，投产前确认 allowlist |
| `tvcmall_list_balance_records` | `direction=all`、`page=1`、`page_size=20`（最大 50） | 筛选、分页、总数和余额流水摘要 | `order.read`；`GET /api/v3/user/balance/list` |

### 6.2 `tvcmall_auth_status`

输出只能是：

```json
{
  "configured": true
}
```

`configured=true` 仅表示当前 session 内存中存在基本格式正确的 PAT；它不能表达用户身份、scopes、expiry 或 WebApi 验证结果。禁止添加 PAT、token ID、display name 或 scope 列表。

### 6.3 商品输入

```json
{
  "query": "iphone case",
  "page": 1,
  "page_size": 20
}
```

商品详情：

```json
{
  "product_id": "123456"
}
```

结果包含面向 AI 的短文本摘要和 `structuredContent`。搜索无结果时返回空 items 与明确摘要；单个商品不存在可返回稳定的 `PRODUCT_NOT_FOUND`，不得回显 WebApi 原始正文。

### 6.4 运费输入

```json
{
  "sku": "100100",
  "quantity": 20,
  "countrycode": "US"
}
```

`countrycode` 规范化为大写。该 tool 只用于未下单商品；用户提供订单号询问运费时应使用 `tvcmall_get_tracking_info`。

### 6.5 订单输入

```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-20",
  "status": "shipped",
  "page": 1,
  "page_size": 20
}
```

`status` 可为 `pending`、`processing`、`shipped`、`delivered`、`cancelled`。日期格式与后端最终约束需保持一致；无筛选时不得隐式扩大到无限分页。

订单详情：

```json
{
  "order_id": "V24011000008"
}
```

地址、邮编、电话等字段必须经过 WebApi 权限/脱敏后才能进入结构化结果；tool 不应恢复或推断被掩码的数据。

### 6.6 物流输入

单个订单：

```json
{
  "order_id": "V24011000008"
}
```

批量：

```json
{
  "order_ids": ["V24011000008", "V24011000009"]
}
```

批量 tool 最多接收 50 个订单号。实现可以并行或逐个调用现有物流 route，但必须服从 WebApi 限流并避免在错误中回显 PAT 或完整 PII。

### 6.7 积分输入

积分汇总无参数。积分记录使用：

```json
{
  "page": 1,
  "page_size": 20
}
```

积分 tool 只读；积分兑换、转余额或其他写操作不在 v0.1 范围。

### 6.8 余额流水输入

```json
{
  "direction": "all",
  "page": 1,
  "page_size": 20
}
```

- `all` → `pointstype=0`：全部流水。
- `income` → `pointstype=1`：获取余额。
- `expense` → `pointstype=2`：消耗余额。

余额流水 tool 调用 `GET /api/v3/user/balance/list`，只读且单页最多 50 条。结构化记录包含金额、类型、说明、关联订单和时间；不返回 WebApi 响应中的 `UserID`。记录返回未知 `PointsType` 时映射为 `unknown`，不得根据金额正负猜测方向。

## 7. 输出约束

- 每个成功 tool 同时提供简短 `content` 文本和符合 output schema 的 `structuredContent`。
- 分页响应包含 page、page_size、total 和当前页 items；不自动抓取无限页。
- 不原样透传大型 WebApi JSON、HTML 错误页或响应 headers。
- 不返回 PAT、PAT 指纹、WebApi `Authorization`、内部 verifier、数据库字段或完整错误正文。
- PII 只保留完成用户任务所必需且已被后端允许/脱敏的字段。
- `tvcmall_auth_status` 是唯一不调用 WebApi 的认证提示 tool，且只返回 configured。

## 8. 错误契约

### 8.1 稳定映射

| 来源 | HTTP / MCP 结果 | 稳定错误码 | 客户端提示 |
| --- | --- | --- | --- |
| 缺少/无效 `TVCMALL_API_KEY`，或携带入站 `Authorization` | HTTP `401` | `AUTH_REQUIRED` | 按新客户端契约重新配置 PAT |
| WebApi `401` | tool error | `AUTH_REQUIRED` | PAT 可能无效、过期、撤销或暂不可验证 |
| WebApi `403` | tool error | `PERMISSION_DENIED` | 检查 scope、route 登记与 enabled 状态 |
| WebApi `429` | tool error | `RATE_LIMITED` | 稍后重试；只使用安全重试提示 |
| WebApi `5xx` | tool error | `API_UNAVAILABLE` | WebApi 暂不可用 |
| 网络错误、超时、body read failure | tool error | `API_UNAVAILABLE` | 稍后重试，不归因于 PAT |
| MCP SDK 输入 schema 不合法 | JSON-RPC error，handler 前拒绝 | `Invalid params`（`-32602`） | 修正输入；不进入 WebApi |
| session ID 不存在或已清理 | HTTP `404` | `SESSION_NOT_FOUND` | 重新 initialize |
| session PAT 指纹不一致 | HTTP `401` | `AUTH_REQUIRED` | 不暴露 session 归属 |
| session 达到容量上限 | HTTP `503` | `SESSION_CAPACITY_REACHED` | 稍后重新 initialize |

WebApi `401` 与 `403` 不可合并：前者是认证问题，后者是 route/scope 授权问题。WebApi `5xx`、网络、超时或正文读取失败不可映射成认证错误。

输入 schema 由 MCP SDK 在 tool handler 前校验；不合法输入按 JSON-RPC `Invalid params`（`-32602`）拒绝，不进入 WebApi，也不属于项目的 WebApi 稳定错误码。错误不得泄露 PAT 或堆栈。

### 8.2 安全错误正文

错误响应和 tool 文本允许包含稳定错误码与操作建议，但不得包含：

- 入站 `TVCMALL_API_KEY`、出站 `Authorization` 或 PAT 的任意完整片段。
- WebApi 原始 response body、堆栈、内部 host 或数据库信息。
- PAT 是否存在于 RDS、归属用户、精确过期/撤销原因。
- 其他 session ID 或 session 数量明细。

## 9. 运行时配置契约

| 变量 | 必填 | 默认值 | 校验 |
| --- | --- | --- | --- |
| `TVCMALL_WEBAPI_BASE_URL` | 是 | 无 | 包含实际 WebApi 基础路径（示例 `/api`）；`production` / `staging` 必须 HTTPS，只有 `sandbox` 可使用受限的 loopback/RFC1918 HTTP；无 userinfo/query/fragment |
| `TVCMALL_API_TIMEOUT_MS` | 否 | `15000` | `1..2_147_483_647` 范围内的整数，毫秒 |
| `TVCMALL_API_ENV` | 否 | `production` | `production` / `staging` / `sandbox` |
| `TVCMALL_MCP_HOST` | 否 | `127.0.0.1` | 非空字符串 |
| `TVCMALL_MCP_PORT` | 否 | `3000` | 正整数 |
| `TVCMALL_MCP_PATH` | 否 | `/mcp` | 以 `/` 开头，无 query/fragment |
| `TVCMALL_LOG_LEVEL` | 否 | `info` | `silent` / `error` / `warn` / `info` / `debug` |

PAT 不属于 server runtime config。禁止以环境变量配置一个供所有客户共享的 PAT。

远程 Streamable HTTP 入口将普通诊断日志写到 stderr，使用一行一个 JSON 对象。默认 `info` 输出服务启动、MCP 请求完成、已执行 tool 的完成记录，以及每次下游 WebApi 请求的详细完成事件；`debug` 追加 session 生命周期，`warn` / `error` 按严重级别过滤，只有显式 `silent` 完全关闭普通日志。对于失败的下游 WebApi tool 调用，摘要完成记录可包含 `webApiMethod`、`normalizedRoute`、`webApiStatus`、UUID `traceId` 和白名单 `authReason`。详细 `mcp_webapi_request_completed` 事件可包含脱敏后的 `webApiRequestHeaders`、`webApiRequestQuery`、request/response body 和 response headers；不得记录入站 header、未脱敏的 PAT、`Authorization`、Cookie、MCP 参数、session ID、完整 URL、原始 WebApi 正文、堆栈或 PII。

`.env.example` 仅提供泛化的 sandbox 本地配置；开发者可在 Git 忽略的 `.env.local` 填入受控 WebApi 地址，并通过 `npm run dev:local` 或 `npm run start:local` 显式加载。`.env.local` 禁止包含 `TVCMALL_API_KEY` 或 PAT，原 `dev` / `start` 和生产部署不自动读取该文件。

`TVCMALL_API_TIMEOUT_MS` 默认 `15000` ms，合法范围为 `1..2_147_483_647` ms；非法或超限值回退到默认值。该 deadline 覆盖等待 response headers 与读取 JSON body；超时映射为 `API_UNAVAILABLE`。

## 10. 安全与验收检查

- [ ] `TVCMALL_API_KEY` 格式、每请求发送、旧 `Authorization` 拒绝和 session 指纹绑定有测试。
- [ ] PAT 原文仅存在于当前 session 内存，所有关闭路径均清理。
- [ ] WebApi 请求使用相同 PAT，并只添加一次 `Bearer `。
- [ ] WebApi URL 拒绝 userinfo/query/fragment；`production` / `staging` 强制 HTTPS，HTTP 只允许显式 `sandbox` 的 loopback/RFC1918 host。
- [ ] 所有业务 routes 都是现有 WebApi routes，并已确认 method + normalized route allowlist。
- [ ] `catalog.read` 与 `order.read` 由 ApplicationServices/RDS 判断，MCP 不做本地 scope 放行。
- [ ] 401/403/429/5xx、网络、超时与 body read failure 的项目错误映射稳定；非法输入由 MCP SDK 返回 `Invalid params`（`-32602`）。
- [ ] `tvcmall_auth_status` 只返回 configured。
- [ ] 日志、异常、tool 输出、fixtures 和测试快照不含真实 PAT、原始未脱敏响应或非必要 PII。
- [ ] tools 只覆盖商品、订单、物流、运费、积分和余额流水只读查询，不暴露写操作或文件型能力。
