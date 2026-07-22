# TVCMall Customer MCP

TVCMall Customer MCP 是部署在 TVCMall 基础设施中的远程 Streamable HTTP MCP Server。Claude、Cursor、Codex 或其他 MCP Client 通过 HTTPS `/mcp` 连接，并在每个请求中携带 TVCMall 签发的 Personal Access Token（PAT）。客户无需在本机安装本项目、运行登录 CLI 或保存网站账号密码。

当前 v0.1 提供商品、订单、物流、运费和积分的只读查询。MCP Client 通过 `TVCMALL_API_KEY` 发送原始 PAT；MCP Server 调用现有 TVCMall WebApi 时转换为 `Authorization: Bearer <PAT>`。WebApi、ApplicationServices 与 RDS 负责 PAT 校验、scope 和 method + normalized route allowlist 授权。

## 文档地图

- `tvcmall-webapi mcp开发接入说明文档.md`：MCP 调用 WebApi 的权威 PAT 接入契约。
- `docs/remote-streamable-http-mcp-architecture.md`：技术架构、部署拓扑、数据流、信任边界和验收清单。
- `docs/api-contract.md`：远程 MCP、PAT、session、tools、WebApi route 和错误码契约。
- `docs/mvp-scope.md`：v0.1 范围、实施阶段、验收标准和风险。
- `docs/harness.md`：fixtures、内部 stdio 适配器与 HTTP 集成测试规则。

## 客户端接入

先从 TVCMall 安全渠道获取 PAT。格式为：

```text
tmcp_v1_{tokenId}.{secret}
```

在 MCP Client 中配置远程 URL 与每个用户自己的 PAT：

```json
{
  "mcpServers": {
    "tvcmall": {
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "TVCMALL_API_KEY": "tmcp_v1_{tokenId}.{secret}"
      }
    }
  }
}
```

`https://mcp.example.com/mcp` 是部署方需要替换的生产 URL 示例。`TVCMALL_API_KEY` 必须出现在每个 `POST`、`GET` 和 `DELETE /mcp` 请求中；初始化成功后，客户端还必须携带服务端返回的 `Mcp-Session-Id` 和同一 PAT。旧客户端的入站 `Authorization` 不受支持，同时发送两种凭据也会返回 `401 AUTH_REQUIRED`。真实 PAT 应通过 MCP Client 的 secret 管理能力配置，不要写进仓库、公开模板、日志或对话。

可以在 MCP Client 中提问：

```text
帮我查找 TVCMall 上适合 iPhone 的手机壳
查看商品 123456 的详情
估算 SKU 100100 发往美国、数量 20 的运费
查询我最近 10 个订单
查询订单 V24011000008 的物流和运费
查看我的积分余额和积分记录
```

## Tools

| Tool | 用途 | WebApi scope |
| --- | --- | --- |
| `tvcmall_auth_status` | 仅报告当前 session 是否已配置 PAT | 不调用 WebApi |
| `tvcmall_search_products` | 分页搜索商品 | `catalog.read` |
| `tvcmall_get_product_detail` | 查看商品详情 | `catalog.read` |
| `tvcmall_estimate_shipping` | 按 SKU、数量和目的地估算未下单商品运费 | `catalog.read` |
| `tvcmall_list_orders` | 分页查询订单 | `order.read` |
| `tvcmall_get_order_detail` | 查看订单详情 | `order.read` |
| `tvcmall_get_tracking_info` | 查询单个订单物流和订单级运费 | `order.read` |
| `tvcmall_batch_get_tracking` | 批量查询最多 50 个订单的物流 | `order.read` |
| `tvcmall_get_points` | 查看积分汇总 | `order.read` |
| `tvcmall_list_point_records` | 分页查看积分记录 | `order.read` |

`tvcmall_auth_status` 的结果只有 `{ "configured": true | false }`，表示 PAT 是否存在于当前 MCP session，不表示 WebApi 已验证该 PAT。

`tvcmall_list_point_records` 当前调用 `/api/v3/user/points/list`；该 method + route 投产前必须由 WebApi/ApplicationServices 团队登记到 `order.read` allowlist。未登记时 WebApi 会返回 `403`，MCP 映射为 `PERMISSION_DENIED`，MCP Server 不会绕过授权。

v0.1 不提供文件导出能力，也不开放下单、支付、改地址、取消订单、积分兑换等写操作。tool 返回 AI 友好摘要和受 schema 约束的结构化数据，不返回 PAT、完整上游响应或不必要的 PII。

## 远程部署

本节供 TVCMall 服务运维与开发人员使用；它不是客户本地安装流程。

```bash
npm install
npm test
npm run typecheck
npm run build
TVCMALL_WEBAPI_BASE_URL=https://webapi.example.com/api npm start
```

生产环境应把服务部署在 TLS 终止层后，只暴露 `/mcp` 和无敏感信息的 `/healthz`。反向代理与应用日志都不得记录入站 `TVCMALL_API_KEY`、出站 `Authorization` 或 PAT。MCP Server 不配置服务器共享 PAT；PAT 只能由各 MCP Client 在请求头中提供。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TVCMALL_WEBAPI_BASE_URL` | 无，必填 | 现有 TVCMall WebApi 基础 URL；必须包含实际基础路径（示例 `/api`）、使用 HTTPS，且不得包含 userinfo、query 或 fragment |
| `TVCMALL_API_TIMEOUT_MS` | `15000` | WebApi 请求超时，单位毫秒；合法范围 `1..2_147_483_647` |
| `TVCMALL_API_ENV` | `production` | API 环境标识：`production`、`staging` 或 `sandbox` |
| `TVCMALL_MCP_HOST` | `127.0.0.1` | HTTP 监听地址；生产环境通常由反向代理访问 |
| `TVCMALL_MCP_PORT` | `3000` | HTTP 监听端口 |
| `TVCMALL_MCP_PATH` | `/mcp` | Streamable HTTP MCP 路径 |
| `TVCMALL_LOG_LEVEL` | `info` | 日志级别；任何级别都必须脱敏凭据和 PII |

`TVCMALL_WEBAPI_BASE_URL` 不提供隐式生产默认值，以免误连环境；例如现有 route 是 `/api/v3/...` 时，base URL 应以 `/api` 结尾，client 再追加 `/v3/...`。MCP Server 只为 PAT 增加一次 `Bearer ` 前缀，并复用接入说明中列出的现有 WebApi route；不会新增 MCP 专用业务 route、调用独立验证服务或交换 token。

`TVCMALL_API_TIMEOUT_MS` 默认 `15000` ms，合法范围为 `1..2_147_483_647` ms；非法或超限值回退到默认值。该 deadline 覆盖等待 response headers 与读取 JSON body；超时映射为 `API_UNAVAILABLE`。

## 最小协议调用

以下示例只演示初始化请求。实际 MCP Client 会管理协议版本、session 和后续 `tools/list`、`tools/call` 请求；真实 PAT 应通过安全变量注入，不应直接出现在 shell 历史中。

```bash
curl https://mcp.example.com/mcp \
  -H "TVCMALL_API_KEY: ${TVCMALL_API_KEY:?请先安全设置该变量}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"example","version":"1.0.0"}}}'
```

成功响应包含 `Mcp-Session-Id`。后续请求必须同时携带该 session ID 与同一 `TVCMALL_API_KEY`；替换 PAT 会返回 `401 AUTH_REQUIRED`。

## 故障提示

| 现象 | 含义与处理 |
| --- | --- |
| `401 AUTH_REQUIRED` | PAT 缺失、格式错误，或 WebApi 判定 PAT 无效、过期、已撤销；重新配置 PAT |
| `403 PERMISSION_DENIED` | PAT 缺少 `catalog.read` / `order.read`，或目标 method + route 未在 allowlist 启用；联系 TVCMall 管理员 |
| `429 RATE_LIMITED` | WebApi 正在限流；当前只返回通用安全提示，请稍后重试 |
| `API_UNAVAILABLE` | WebApi `5xx`、网络、超时或响应正文读取失败；不要改 PAT，稍后重试并检查服务状态 |
| `404 SESSION_NOT_FOUND` | session 已删除、空闲过期或服务重启；重新执行 MCP initialize |

## 安全边界

- MCP HTTP 层只校验 API KEY/PAT 基本格式、请求 schema、session 指纹和容量/idle TTL，不判断用户、scope 或过期时间。
- PAT 原文仅保存在当前 session 的内存上下文；SHA-256 指纹只用于防止同一 session 替换 PAT。
- `DELETE /mcp`、transport `onclose`、idle TTL 或 server close 都会清理 session、PAT 与指纹。
- MCP Server 不直连 ApplicationServices 或 RDS；WebApi 是唯一业务入口和授权边界。
- 日志、异常、MCP tool 输出和测试 fixtures 均不得包含真实 PAT、完整地址、电话或其他敏感信息。

详细设计和验收项见 `docs/remote-streamable-http-mcp-architecture.md`。
