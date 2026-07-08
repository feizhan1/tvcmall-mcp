# TVCMall Customer MCP v0.1 API 契约

本文定义 TVCMall Customer MCP v0.1 的本地 CLI、认证接口、token 策略、MCP tools、后端 API、scope、错误码和订单导出契约。

## 1. 设计原则

- MCP server 只使用已保存 token，不直接接收密码。
- 登录、登出、查看当前账号等交互动作通过独立 CLI 完成。
- MCP stdio 通道只承载 JSON-RPC 协议内容，不能被普通日志污染。
- 后端返回的大对象需要在本地 MCP server 中整理为 AI 友好摘要。
- 所有涉及订单、物流、导出的接口都要考虑权限、审计、限流和 PII 脱敏。

## 2. 本地 CLI 命令

```bash
npx @tvcmall/mcp login
npx @tvcmall/mcp logout
npx @tvcmall/mcp whoami
npx @tvcmall/mcp server
npx @tvcmall/mcp install claude
npx @tvcmall/mcp install cursor
npx @tvcmall/mcp install codex
```

命令职责：

- `login`：当前实现使用本地假数据保存 fake token session；后续替换为终端输入用户名和隐藏密码，调用 TVCMall 登录接口，保存真实 token。
- `logout`：当前实现先调用 fake logout，再清除本地 token；后续替换为调用后端 logout 失效当前 refresh token。
- `whoami`：展示当前登录账号、客户 ID、权限范围，不展示 token；如果 session 过期，当前 fake 实现会自动 refresh。
- `server`：启动 MCP stdio server，供 MCP Client 调用。
- `install claude/cursor/codex`：自动写入对应 MCP Client 配置，降低客户安装成本。

MCP Client 配置示例：

```json
{
  "mcpServers": {
    "tvcmall": {
      "command": "npx",
      "args": ["-y", "@tvcmall/mcp", "server"]
    }
  }
}
```

## 3. 为什么 server 模式不接收密码

不要在 `server` 模式里做交互式密码输入。MCP stdio 通道要用于 JSON-RPC 协议，如果 server 启动后在 `stdin/stdout` 上打印 `请输入密码`，很容易破坏 MCP 协议流。

正确做法：

```bash
npx @tvcmall/mcp login
```

这个命令是独立 CLI，不是 MCP server。当前开发阶段它使用假数据保存 fake token session，并提供 fake refresh/logout/me 打通本地链路；后续接入真实接口后，它可以安全地在终端读取用户名和隐藏密码。登录完成后，MCP server 再读取本地 token。

## 4. 后端认证接口

建议新增 MCP 专用授权接口，不要直接复用网页登录接口。

```http
POST /api/mcp/auth/login
POST /api/mcp/auth/refresh
POST /api/mcp/auth/logout
GET  /api/mcp/auth/me
```

### POST /api/mcp/auth/login

请求：

```json
{
  "username": "customer@example.com",
  "password": "********",
  "device_name": "MacBook Pro",
  "client": "tvcmall-mcp",
  "client_version": "0.1.0"
}
```

响应：

```json
{
  "access_token": "eyJ...",
  "refresh_token": "rft_...",
  "expires_in": 7200,
  "token_type": "Bearer",
  "customer": {
    "id": "cus_123",
    "email": "customer@example.com",
    "name": "Customer Name"
  },
  "scopes": [
    "products:read",
    "orders:read",
    "tracking:read",
    "orders:export"
  ]
}
```

### Token 策略

- `access_token`：短期有效，例如 1-2 小时。
- `refresh_token`：长期但可撤销，例如 30-90 天。
- 后端支持设备级撤销。
- 每次 refresh 可以轮换 refresh token。
- 失败登录需要限流和风控。

## 5. 本地凭证存储

优先级：

1. 系统凭证库：macOS Keychain、Windows Credential Manager、Linux Secret Service。当前本地实现使用 `keytar` 适配系统凭证库。
2. 如果系统凭证库不可用，当前实现安全降级为未登录状态；本地加密文件 fallback 需要单独评审密钥管理方案。
3. 不允许保存明文密码。
4. 不允许把 token 打印到 stdout。
5. 日志中必须脱敏 token、用户名、地址、电话等敏感信息。

本地配置建议：

```text
~/.config/tvcmall-mcp/config.json
~/.config/tvcmall-mcp/logs/
~/Downloads/tvcmall-exports/
```

其中 token 不建议直接放 `config.json`，应放系统凭证库。

### 运行时环境变量

真实 HTTP API client 接入后，运行时配置由 `src/config/runtime-config.ts` 统一读取，MCP tools 和领域 client 不应直接散落读取 `process.env`。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TVCMALL_API_BASE_URL` | `https://api.tvcmall.com` | TVCMall HTTP API base URL |
| `TVCMALL_API_TIMEOUT_MS` | `15000` | HTTP 请求超时时间，单位毫秒；无效值回退默认值 |
| `TVCMALL_API_ENV` | `production` | API 环境：`production`、`staging`、`sandbox`；无效值回退默认值 |
| `TVCMALL_LOG_LEVEL` | `info` | 日志级别：`silent`、`error`、`warn`、`info`、`debug`；无效值回退默认值 |
| `TVCMALL_EXPORT_DIR` | 未设置 | 默认订单导出目录；为空时由导出逻辑自行选择安全默认目录 |

环境变量只用于非敏感运行时配置；`access_token`、`refresh_token`、密码、完整地址、电话、邮箱等敏感信息不应放入环境变量、`config.json` 或日志。

## 6. MCP Tools

登录相关不要做成接收密码的 MCP tool。MCP tools 只使用已保存 token。

### v0.1 tools 列表

```text
tvcmall_auth_status
tvcmall_search_products
tvcmall_get_product_detail
tvcmall_estimate_shipping
tvcmall_list_orders
tvcmall_get_order_detail
tvcmall_get_tracking_info
tvcmall_batch_get_tracking
tvcmall_export_orders
```

### tvcmall_auth_status

```json
{
  "description": "检查当前 TVCMall MCP 是否已登录",
  "input": {},
  "output": {
    "logged_in": true,
    "customer_email": "customer@example.com",
    "scopes": ["products:read", "orders:read"]
  }
}
```

### tvcmall_search_products

当前实现使用本地假商品数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED` 引导。后续替换为真实 `/api/mcp/products/search`。

```json
{
  "query": "iphone case",
  "page": 1,
  "page_size": 20
}
```

返回应是 AI 友好的摘要，不要直接暴露过大的原始 API 响应。当前结构化输出包含 `query`、`page`、`page_size`、`total`、`items`。

### tvcmall_get_product_detail

当前实现使用本地假商品详情数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`。后续替换为真实 `/api/mcp/products/{id}`。

```json
{
  "product_id": "prd_iphone_case_001"
}
```

结构化输出包含商品摘要、MOQ、重量、尺寸、属性和图片 URL。

### tvcmall_estimate_shipping

当前实现使用本地假运费规则，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`。后续替换为真实 `/api/mcp/shipping/estimate`。

```json
{
  "destination_country": "US",
  "items": [
    { "product_id": "prd_iphone_case_001", "quantity": 10 }
  ]
}
```

结构化输出包含目的国家、计费重量、商品数量和多个运输选项。

### tvcmall_list_orders

当前实现使用本地假订单数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`。后续替换为真实 `/api/mcp/orders`。

```json
{
  "start_date": "2026-06-01",
  "end_date": "2026-06-30",
  "status": "shipped",
  "page": 1,
  "page_size": 20
}
```

### tvcmall_get_order_detail

当前实现使用本地假订单详情数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`，找不到订单返回 `ORDER_NOT_FOUND`。后续替换为真实 `/api/mcp/orders/{id}`。

```json
{
  "order_id": "V10001"
}
```

### tvcmall_get_tracking_info

当前实现使用本地假物流数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`，找不到物流返回 `TRACKING_NOT_FOUND`。后续替换为真实 `/api/mcp/orders/{id}/tracking`。

```json
{
  "order_id": "V10001"
}
```

### tvcmall_batch_get_tracking

当前实现使用本地假物流数据，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`，单次最多 50 个订单。后续替换为真实 `/api/mcp/orders/tracking/batch`。

```json
{
  "order_ids": ["V123", "V456", "V789"]
}
```

建议限制：

```text
单次最多 50 个订单
超过数量要求用户分批或使用导出
```

### tvcmall_export_orders

当前实现使用本地假订单数据导出 CSV 文件，要求已有登录 session；未登录时返回 `AUTH_REQUIRED`。`xlsx` 目前返回 `EXPORT_FORMAT_UNSUPPORTED`，后续再接入真实 xlsx exporter。

```json
{
  "start_date": "2026-06-01",
  "end_date": "2026-06-30",
  "status": "shipped",
  "format": "xlsx"
}
```

响应：

```json
{
  "file_path": "~/Downloads/tvcmall-exports/tvcmall-orders-20260707-153000.xlsx",
  "order_count": 238,
  "format": "xlsx",
  "date_range": {
    "start_date": "2026-06-01",
    "end_date": "2026-06-30"
  }
}
```

## 7. 订单导出契约

已确定：订单导出生成本地文件，不在 AI 对话中输出完整订单表。

默认目录：

```text
~/Downloads/tvcmall-exports/
```

支持格式：

```text
当前 fake 实现：csv
后续 v0.1 完整实现：xlsx 优先，csv 可同时支持
```

安全限制：

- 默认最多导出 90 天。
- 大批量导出必须分页拉取。
- 导出前后端做权限校验：`orders:export`。
- MCP 对话里只返回文件路径和摘要。
- 电话、邮箱、地址是否脱敏由后端权限控制。
- 文件名带时间戳，避免覆盖。

文件名示例：

```text
tvcmall-orders-20260707-153000.xlsx
tvcmall-orders-20260707-153000.csv
```

## 8. 后端业务 API

MCP 后端 Gateway 至少需要提供这些能力：

```http
GET  /api/mcp/products/search
GET  /api/mcp/products/{id}
POST /api/mcp/shipping/estimate

GET  /api/mcp/orders
GET  /api/mcp/orders/{id}
GET  /api/mcp/orders/{id}/tracking
POST /api/mcp/orders/tracking/batch
POST /api/mcp/orders/export
```

如果已有 Open API 可以覆盖这些能力，后端可以先做一层 MCP Gateway 转发；如果现有 Open API 权限模型不适合客户侧 MCP，建议单独实现 MCP API 层。

TVCMall 公开 Open API 文档已经有 Authorization、Product、Order、Shipping 等模块，可作为后端能力映射参考。

## 9. 权限 Scope

```text
products:read       商品搜索和商品详情
shipping:estimate   运费估算
orders:read         订单列表和订单详情
tracking:read       物流查询
orders:export       订单导出
profile:read        当前客户身份
```

第一版不要开放：

```text
orders:create
orders:update
orders:cancel
payment:create
address:update
```

## 10. 错误处理

MCP server 不应直接把后端错误原文全部丢给 AI。建议统一错误码。

```text
AUTH_REQUIRED        未登录，请先运行 npx @tvcmall/mcp login
TOKEN_EXPIRED        token 已过期，自动 refresh 失败
PERMISSION_DENIED    当前账号没有该权限
RATE_LIMITED         请求过快，请稍后再试
VALIDATION_ERROR     参数格式错误
API_UNAVAILABLE      TVCMall 服务暂不可用
EXPORT_TOO_LARGE     导出范围过大，请缩小时间范围
```

用户可读错误示例：

```text
你还没有登录 TVCMall。请先在终端执行：
npx @tvcmall/mcp login
```

## 11. 实现注意事项

- 所有 tool 输入都要做 schema 校验。
- 分页参数要设置默认值和上限。
- 批量查询要设置最大数量，建议单次最多 50 个订单。
- 当前 fake auth client 已覆盖 login、refresh、logout、me；真实 HTTP client 需要统一处理超时、重试、token refresh 和错误映射。
- stdout 只用于 MCP 协议；日志输出到 stderr 或日志文件。
- 返回给 AI 的数据要做摘要和脱敏，不要输出超大原始 JSON。
