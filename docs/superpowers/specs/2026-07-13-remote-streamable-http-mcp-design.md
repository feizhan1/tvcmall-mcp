# TVCMall 远程 Streamable HTTP MCP 最终设计

> 状态：历史归档。当前客户端入站认证以 `docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md` 和公开 API 契约为准；本文不得作为当前实施入口。

> 本文最初用于讨论远程化方案，现已按 2026-07-20 确认的 WebApi PAT 契约更新为最终设计。授权细节以仓库根目录 `tvcmall-webapi mcp开发接入说明文档.md` 为准。

## 目标

将 TVCMall Customer MCP 作为远程 Streamable HTTP 服务部署在 TVCMall 基础设施中。MCP Client 只配置远程 `/mcp` URL 与 TVCMall PAT，不在本机运行服务、登录 CLI 或网站账号密码流程。

本期保留商品、订单、物流、运费和积分只读 tools，不开放写操作，也不提供文件导出能力。

## 最终授权选择

MCP Client 在每个 `/mcp` 请求发送：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

MCP Server 在 session 内保存原始 PAT，调用现有 TVCMall WebApi route 时原样使用该 PAT，只增加一次 `Bearer `。TVCMall WebApi、ApplicationServices 与 RDS 负责 PAT verifier、`catalog.read` / `order.read` 以及 method + normalized route allowlist。

明确不采用以下模式：

- MCP 先访问额外认证端点再换取业务 token。
- 网站用户名密码或 OAuth 登录。
- MCP 解析 customer、display name、scopes 或 expiry。
- MCP Server 配置一个所有用户共享的 PAT。
- MCP 直连 ApplicationServices/RDS，或新增 `/api/mcp/v1/...` 业务 routes。

## 架构

```text
MCP Client
  | HTTPS /mcp + Bearer tmcp_v1_...
  v
Remote Streamable HTTP MCP
  | PAT 基本格式、session SHA-256 指纹、schema、容量/idle TTL
  | 同一 Bearer PAT
  v
Existing TVCMall WebApi routes
  | ApplicationServices: PAT + scope + route allowlist
  v
RDS + existing business actions
```

MCP SDK 使用 `StreamableHTTPServerTransport`。每个 session 都有独立的 `McpServer`、transport 与 PAT 上下文，避免并发请求在全局变量中串用凭据。

## HTTP 与 session

服务暴露：

- `POST /mcp`：initialize 与 MCP JSON-RPC 请求。
- `GET /mcp`：SDK 支持的流式恢复请求。
- `DELETE /mcp`：终止 MCP session。
- `GET /healthz`：只返回服务存活状态。

初始化只校验 Bearer/PAT 基本格式与 request schema，不预先调用 WebApi。成功后返回 `Mcp-Session-Id`，并将 PAT 的 SHA-256 指纹绑定到 session。后续请求必须携带该 ID 和同一 PAT；替换 PAT 返回 `401 AUTH_REQUIRED`。

原始 PAT 与指纹都只保存在 session 内存。`DELETE`、transport `onclose`、idle TTL、初始化失败与 server close 均关闭 transport/MCP Server 并清理认证上下文。

## Tool 与 WebApi

| Tool 范围 | Scope | 现有 WebApi route 示例 |
| --- | --- | --- |
| 商品搜索、商品详情、商品运费估算 | `catalog.read` | `/api/v3/product/list/search/mapping`、`/api/v3/productdetail/detail`、`/api/v3/productdetail/shipping/compute` |
| 订单、物流、积分 | `order.read` | `/api/v3/user/getorders`、`/api/v3/order/detail`、`/api/order/getlogisticstracking`、`/api/v3/user/points/stat` |

tool 层只做参数校验、业务 client 调用和输出摘要，不读取本地 scope 列表。route 未登记、被禁用或 PAT scope 不足由 WebApi 返回 `403`。

`tvcmall_auth_status` 只返回：

```json
{
  "configured": true
}
```

它不返回 PAT、token ID、用户或 scopes，也不声称 WebApi 已验证 PAT。

## 错误语义

| 来源 | 稳定错误 |
| --- | --- |
| MCP 请求缺少 Bearer PAT 或基本格式错误 | `AUTH_REQUIRED` |
| session 中替换 PAT | `AUTH_REQUIRED` |
| WebApi `401` | `AUTH_REQUIRED` |
| WebApi `403` | `PERMISSION_DENIED` |
| WebApi `429` | `RATE_LIMITED` |
| WebApi `5xx`、网络、超时、body read failure | `API_UNAVAILABLE` |
| MCP SDK 输入 schema 不合法 | JSON-RPC `Invalid params`（`-32602`）；handler 前拒绝，不进入 WebApi |

输入 schema 不合法不属于项目的 WebApi 稳定错误码。MCP SDK 在 tool handler 前拒绝请求，响应不得包含 PAT、堆栈、上游正文、内部 host、用户归属或精确撤销原因。

## 配置与部署

| 配置 | 说明 |
| --- | --- |
| `TVCMALL_WEBAPI_BASE_URL` | 必填 HTTPS WebApi 基础 URL；无 userinfo/query/fragment |
| `TVCMALL_API_TIMEOUT_MS` | WebApi 超时；默认 15000 ms；合法范围 `1..2_147_483_647` ms |
| `TVCMALL_MCP_HOST` | 监听地址，默认 `127.0.0.1` |
| `TVCMALL_MCP_PORT` | 监听端口，默认 `3000` |
| `TVCMALL_MCP_PATH` | MCP 路径，默认 `/mcp` |

生产环境部署在 TLS 终止层后。反向代理与应用均不记录 `Authorization`。多副本部署使用 session affinity，不通过共享存储复制 PAT。

`TVCMALL_API_TIMEOUT_MS` 默认 `15000` ms，合法范围为 `1..2_147_483_647` ms；非法或超限值回退到默认值。该 deadline 覆盖等待 response headers 与读取 JSON body；超时映射为 `API_UNAVAILABLE`。

## 安全约束

- PAT 只能由 MCP Client 提供，只能发送给配置的 TVCMall WebApi。
- 日志、异常、tracing、MCP tool 输出、fixtures 和测试快照禁止出现真实 PAT。
- RDS 只保存 PAT 元数据/verifier，不保存明文 secret。
- 订单、物流和地址等数据服从 WebApi 权限与脱敏策略；MCP 只返回任务必要摘要。
- session 指纹只用于同 session 比对，不替代 WebApi 授权，也不持久化。

## 测试与验收

1. 无 PAT、非 Bearer 或基本格式错误的 initialize 返回 `401 AUTH_REQUIRED`。
2. 有效格式 PAT 可建立 session 并获得 `Mcp-Session-Id`。
3. 同一 session 替换 PAT 被拒绝，响应和日志不泄露任一 PAT。
4. 不同 session 不共享 MCP Server、transport、PAT 或指纹。
5. 每个 HTTP client 把同一 PAT 发送给现有 WebApi route，且只添加一次 `Bearer `。
6. WebApi `401`、`403`、`429`、`5xx` 与网络/超时/body read failure 映射稳定。
7. `tvcmall_auth_status` 只有 configured 状态，tools 不做本地 scope 判断。
8. `DELETE`、`onclose`、idle TTL 和 server close 均清理 session。
9. 运行 Streamable HTTP 集成测试、unit tests、typecheck、build 与敏感信息残留检查。
