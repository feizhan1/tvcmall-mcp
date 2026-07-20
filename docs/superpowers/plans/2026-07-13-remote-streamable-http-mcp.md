# 远程 Streamable HTTP MCP 计划索引（最终 PAT 模型）

> 本文件是 2026-07-13 远程化计划的历史入口。远程传输方向保留，但早期独立认证与短期 token 交换假设已废弃；实现统一执行 `docs/superpowers/plans/2026-07-20-webapi-pat-auth.md`。

## 最终目标

将 TVCMall Customer MCP 部署为远程 Streamable HTTP 服务。MCP Client 在每个 `/mcp` 请求发送：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

MCP Server 只校验 Bearer/PAT 基本格式、请求 schema、session SHA-256 指纹、容量与 idle TTL，并将当前 session 的同一 PAT 原样传给现有 TVCMall WebApi route。

WebApi → ApplicationServices → RDS 负责 PAT verifier、`catalog.read` / `order.read`、method + normalized route allowlist 和业务权限。MCP 不直连 ApplicationServices/RDS，不新增 MCP 专用业务 route。

## 执行入口

- 最终授权设计：`docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md`
- 当前实施计划：`docs/superpowers/plans/2026-07-20-webapi-pat-auth.md`
- 公开技术架构：`docs/remote-streamable-http-mcp-architecture.md`
- API 契约：`docs/api-contract.md`
- 权威 WebApi 接入说明：`tvcmall-webapi mcp开发接入说明文档.md`

## 保留的远程化工作

1. 用 MCP SDK `StreamableHTTPServerTransport` 提供 `POST` / `GET` / `DELETE /mcp`。
2. 每个 session 使用独立 `McpServer`、transport、PAT 内存上下文和 SHA-256 指纹。
3. 后续请求必须同时携带 `Mcp-Session-Id` 与同一 PAT；替换 PAT 返回 `AUTH_REQUIRED`。
4. 实现并发初始化容量、idle TTL、transport `onclose`、`DELETE` 与 server close 清理。
5. 真实 HTTP clients 复用现有商品、订单、物流、运费和积分 WebApi routes。
6. 统一映射 WebApi `401` / `403` / `429` / `5xx`、网络、超时和 body read failure。
7. 对日志、异常、tracing、tool 输出、fixtures 与测试快照执行 PAT/PII 泄漏检查。
8. 使用 Streamable HTTP 集成测试验证 `initialize`、`tools/list` 与 `tools/call`。

## 已废弃假设

- 不访问额外认证服务，不把 PAT 换成另一种业务 token。
- 不解析用户、display name、scopes 或 expiry，不在 tool 层做本地 scope 判断。
- 不使用网站用户名密码、OAuth、本地 Keychain 或服务器共享 PAT。
- 不把内部 stdio harness 当作客户安装、认证或生产部署入口。
- v0.1 不提供文件导出能力，也不开放写接口。

后续不得从本历史入口恢复上述旧假设。任何授权变化都应先更新根目录权威接入说明，再同步公开架构与 API 契约。
