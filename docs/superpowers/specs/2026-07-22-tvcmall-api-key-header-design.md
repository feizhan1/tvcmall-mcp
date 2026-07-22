# TVCMALL_API_KEY 入站认证设计

## 目标

远程 Streamable HTTP MCP 使用每个用户独立的 TVCMall PAT。MCP Client 在每个 `/mcp` 请求的 `TVCMALL_API_KEY` Header 中发送原始 PAT；MCP Server 将该 PAT 转为 TVCMall WebApi 要求的 `Authorization: Bearer ...`。本次直接替换旧入站契约，不兼容使用 `Authorization` Header 的旧 MCP Client 配置。

## 客户端契约

客户端配置示例：

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

`TVCMALL_API_KEY` 的值是 TVCMall 为当前用户签发的完整 PAT，不是共享 API Key、网站登录 token 或环境名称。每个用户配置自己的 PAT；MCP Server 不配置供所有用户共享的 PAT。

除无需认证的 `GET /healthz` 外，客户端必须在每个 `POST`、`GET` 和 `DELETE /mcp` 请求中发送：

```http
TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}
```

初始化后的请求还必须发送服务端返回的 `Mcp-Session-Id`。Header 名按 HTTP 规则大小写不敏感，但公开示例统一使用 `TVCMALL_API_KEY`。

## 不兼容旧客户端

MCP 入站不再读取 `Authorization`。以下请求即使携带有效 PAT，也返回 `401 AUTH_REQUIRED`：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

如果请求同时携带 `TVCMALL_API_KEY` 与 `Authorization`，同样返回 `401 AUTH_REQUIRED`。MCP 入站完全拒绝 `Authorization`，不设置备用凭据或双凭据优先级，也不会把客户端 `Authorization` 透传给 WebApi。

## 认证与 Session

MCP HTTP 层只执行以下边界检查：

1. 读取单值 `TVCMALL_API_KEY` Header。
2. 校验值符合 `tmcp_v1_{tokenId}.{secret}` 基本格式，且不包含空白。
3. 使用原始 PAT 创建 session 内存认证上下文。
4. 对 PAT 计算 SHA-256 指纹并绑定 `Mcp-Session-Id`。
5. 后续请求校验同一 Header 的 PAT 指纹与 session 一致。

基本格式通过只表示请求可以建立 MCP session，不代表 PAT 已验证。MCP Server 不解析用户、scope、过期时间或 route allowlist，不调用独立认证接口，也不交换 token。

原始 PAT 和指纹只存在于当前进程的 session 内存中。`DELETE /mcp`、transport `onclose`、idle TTL、initialize 失败或 server close 时关闭并清理 session。PAT、指纹和完整 Header 不进入日志、错误、tool 输出、tracing 或持久层。

## WebApi 调用

业务 tool 从当前 session 读取原始 PAT，并仅在调用现有 TVCMall WebApi 时构造：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

MCP Server 只增加一次 `Bearer ` 前缀，不把客户端传入的 `Authorization` 透传给下游。WebApi base URL 继续使用既有 `TVCMALL_WEBAPI_BASE_URL` 规则：部署时显式配置包含实际 WebApi 基础路径的 HTTPS URL，不增加 localhost HTTP 特例。

TVCMall WebApi、ApplicationServices 和 RDS 是本仓库之外的现有系统：

- MCP Server 只调用 TVCMall WebApi。
- WebApi 识别 PAT，并调用 ApplicationServices。
- ApplicationServices 与 RDS 完成 PAT verifier、scope 和 method + normalized route allowlist 授权。
- 本仓库不实现、模拟或直连 WebApi、ApplicationServices、RDS。

## 数据流

```text
MCP Client
  | TVCMALL_API_KEY: tmcp_v1_...
  v
Remote Streamable HTTP MCP Server
  | PAT 格式校验、session 指纹绑定、tool schema 校验
  | Authorization: Bearer tmcp_v1_...
  v
Existing TVCMall WebApi
  | 现有授权链：ApplicationServices -> RDS
  v
Existing read-only business API response
  | MCP tool output mapping
  v
MCP Client
```

## 错误处理

| 来源 | 结果 | 说明 |
| --- | --- | --- |
| 缺少或格式错误的 `TVCMALL_API_KEY` | HTTP `401 AUTH_REQUIRED` | 不回显 Header 或 PAT |
| 仅发送旧入站 `Authorization` | HTTP `401 AUTH_REQUIRED` | 明确不兼容旧客户端 |
| session PAT 指纹不一致 | HTTP `401 AUTH_REQUIRED` | 不暴露 session 归属 |
| session 不存在或已清理 | HTTP `404 SESSION_NOT_FOUND` | 客户端重新 initialize |
| WebApi `401` | tool error `AUTH_REQUIRED` | PAT 无效、过期、撤销或暂不可验证 |
| WebApi `403` | tool error `PERMISSION_DENIED` | scope、route 或 allowlist 拒绝 |
| WebApi `429` | tool error `RATE_LIMITED` | 使用通用安全提示 |
| WebApi `5xx`、网络、超时或正文读取失败 | tool error `API_UNAVAILABLE` | 不归因于 PAT，不透出上游正文 |

## 文档一致性

根目录 `tvcmall-webapi mcp开发接入说明文档.md` 同时说明两段 Header 契约：

- MCP Client -> MCP Server：`TVCMALL_API_KEY: <PAT>`。
- MCP Server -> TVCMall WebApi：`Authorization: Bearer <PAT>`。

该文档不再使用 `TVCMALL_MCP_PAT` 或其他 server 环境变量作为共享 PAT 来源。README、API 契约、MVP、harness、技术架构图与数据流图使用相同术语。历史规格和计划标注为已归档，不能作为当前客户端接入入口。

## 测试与验收

1. 缺少、空值、重复值或格式错误的 `TVCMALL_API_KEY` 返回 `401 AUTH_REQUIRED`。
2. 仅携带旧 `Authorization: Bearer ...` 的请求返回 `401 AUTH_REQUIRED`。
3. 有效 `TVCMALL_API_KEY` 可建立 session，认证上下文包含原始 PAT 与预期 SHA-256 指纹。
4. 后续 `POST`、`GET`、`DELETE` 必须携带同一 `TVCMALL_API_KEY`；缺少或替换 PAT 均返回 `401`。
5. 客户端同时发送两个 Header 时返回 `401`，下游不会收到客户端 `Authorization`。
6. 业务 HTTP client 仍发送 `Authorization: Bearer <PAT>`，且只增加一次 `Bearer `。
7. `GET /healthz` 不要求 API KEY，且不返回认证或 session 信息。
8. 源码和当前公开文档不再把入站 `Authorization` 描述为受支持方式。
9. `npm test`、`npm run typecheck`、`npm run build` 与真实端口 Streamable HTTP 集成测试全部通过。
