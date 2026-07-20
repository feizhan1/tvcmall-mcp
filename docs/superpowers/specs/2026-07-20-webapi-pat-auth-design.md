# TVCMall WebApi PAT 授权改造设计

## 目标

以仓库根目录的 `tvcmall-webapi mcp开发接入说明文档.md` 为唯一授权契约，将远程 Streamable HTTP MCP 从“API Key 验证接口换取短期 token”改为“客户端 PAT 透传到 TVCMall WebApi”。

## 权威契约

PAT 格式为：

```text
tmcp_v1_{tokenId}.{secret}
```

请求头为：

```http
Authorization: Bearer tmcp_v1_{tokenId}.{secret}
```

不新增 OAuth Gateway、独立 OAuth 服务、PAT 验证接口或 MCP 专用业务路由。MCP Server 复用现有 TVCMall WebApi 路由，由 WebApi 和 ApplicationServices 完成 PAT 验证、scope 校验及 route-scope allowlist 授权。

## 数据流

```text
MCP Client
  | Authorization: Bearer tmcp_v1_...
  v
Remote Streamable HTTP MCP Server
  | 格式校验、session PAT 指纹绑定、tool 参数校验
  | Authorization: Bearer tmcp_v1_...
  v
TVCMall WebApi
  | PAT 校验、catalog.read / order.read、route allowlist
  v
Existing business action
```

MCP Server 不调用 `/api/mcp/auth/verify`，不换取 `upstreamAccessToken`，不解析 customer、displayName、scopes 或 expiresAt。原始 PAT 仅保存在当前 MCP session 的内存认证上下文中；session 关闭后清理。日志、错误和 tool 输出均不得包含 PAT。

## MCP HTTP 会话

客户端在每个 `/mcp` 请求中携带 PAT。初始化请求只校验：

- `Authorization` scheme 为 `Bearer`。
- token 符合 `tmcp_v1_{tokenId}.{secret}` 的基本格式。

初始化不向 WebApi 发起额外验证请求。MCP Server 对 PAT 生成 SHA-256 指纹并绑定 `Mcp-Session-Id`；后续请求必须携带同一 PAT。指纹不用于替代 WebApi 授权，也不写入日志。

## Tool 与业务 API 授权

tool 层删除本地 scope 判断。每个 tool 使用 session 中的 PAT 调用对应现有 WebApi route：

- 商品搜索、商品详情、商品运费估算使用 `catalog.read` route。
- 订单列表、订单详情、物流和积分使用 `order.read` route。

route 未登记、route 被禁用或 PAT scope 不足均由 WebApi 返回 `403`。MCP Server 不通过本地 scope 列表绕过或模拟 WebApi 授权。

## 认证状态工具

保留 `tvcmall_auth_status`，但它只报告 PAT 是否已配置到当前 MCP session：

```json
{
  "configured": true
}
```

它不返回 PAT、token ID、用户信息或 scopes，也不声称 PAT 已被 WebApi 验证。PAT 是否有效最终以业务 WebApi 调用结果为准。

## 错误映射

| 来源 | MCP 稳定错误 | 说明 |
| --- | --- | --- |
| MCP 请求缺少 Bearer PAT 或 PAT 格式错误 | `AUTH_REQUIRED` | 在进入 tool 前拒绝 |
| WebApi `401` | `AUTH_REQUIRED` | PAT 无效、过期、撤销或授权服务不可用；提示重新配置 PAT |
| WebApi `403` | `PERMISSION_DENIED` | route 未登记、禁用或 PAT scope 不足 |
| WebApi `429` | `RATE_LIMITED` | 按 WebApi 限流处理 |
| WebApi `5xx`、网络或超时 | `API_UNAVAILABLE` | 不归因于 PAT，不透出上游正文 |

## 配置调整

删除独立验证服务相关配置：

- `TVCMALL_API_KEY_VERIFY_URL`
- `TVCMALL_API_KEY_VERIFY_TIMEOUT_MS`
- `TVCMALL_ALLOW_INSECURE_API_KEY_VERIFY_URL_FOR_DEVELOPMENT`

WebApi base URL 使用接入文档命名 `TVCMALL_WEBAPI_BASE_URL`。为避免无提示切换到错误环境，生产部署必须显式配置 HTTPS WebApi URL。MCP Server 不支持服务器级共享 PAT 环境变量；PAT 由每个 MCP Client 在远程 MCP Authorization header 中提供。

## 删除项

- `HttpApiKeyVerifier` 及其验证响应 schema。
- `InvalidApiKeyError`、验证服务限流/不可用错误类型。
- `RequestAuthContext` 中的 customer、displayName、scopes、短期 token 和 expiresAt。
- tool 层本地 scope 检查。
- 架构和 API 文档中的独立验证服务、短期 token 与 token exchange 描述。

## 测试与验收

1. 无 PAT、非 Bearer 或不符合 `tmcp_v1_` 格式的初始化请求返回 `401 AUTH_REQUIRED`。
2. 有效格式 PAT 可建立 MCP session，并绑定 PAT 指纹。
3. 同一 session 替换 PAT 时返回 `401`，且错误不泄露任一 PAT。
4. 每个真实 HTTP client 将相同 PAT 作为 `Authorization: Bearer tmcp_v1_...` 发送给 WebApi。
5. tool 不再依据本地 scopes 提前拒绝请求；WebApi `401`、`403` 和 `5xx` 映射为稳定 MCP 错误。
6. `tvcmall_auth_status` 只返回 configured 状态。
7. 源码和公开文档不再引用 API Key 验证 URL、短期业务 token 或独立验证服务。
8. `npm test`、`npm run typecheck` 和 `npm run build` 全部通过。
