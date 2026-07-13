# TVCMall 远程 Streamable HTTP MCP 设计

## 目标

将 TVCMall Customer MCP 从客户电脑上的 `stdio` 进程迁移为部署在 TVCMall 基础设施中的远程 Streamable HTTP 服务。MCP Client 通过 TVCMall 提供的 API Key 连接服务，用户不再安装 npm 包、运行 CLI 登录或在本地保存 token。

## 范围

本次迁移保留商品、积分、运费估算、订单、物流和订单导出 tool 的只读业务范围，替换其传输层与身份模型。

不实现下单、支付、订单修改、地址修改或取消订单等写操作。API Key 的发放、撤销和后台管理界面属于 TVCMall 后端能力，本仓库只定义服务端验证集成点。

## 方案选择

采用“远程 MCP 服务调用 API Key 验证接口”的方案：

1. MCP Client 在每个 `/mcp` HTTP 请求携带 `Authorization: Bearer <API_KEY>`。
2. 远程 MCP 服务在创建会话时调用 TVCMall API Key 验证接口。
3. 验证接口返回用户、scope 及仅供下游业务 API 调用的短期 token。
4. MCP 服务把验证结果绑定到该 MCP 会话，并使用短期 token 调用商品、订单、积分、物流和导出 API。

API Key 不写入文件、数据库、token store 或日志。MCP 服务不再使用客户端本地 Keychain 或登录账号密码。

## 架构

```text
MCP Client
  |
  | HTTPS + Authorization: Bearer <API_KEY>
  v
Remote Streamable HTTP MCP (/mcp)
  |
  | POST /api/mcp/auth/verify
  | Authorization: Bearer <API_KEY>
  v
TVCMall API Key 验证服务
  |
  | customer + scopes + short-lived upstream access token
  v
Remote MCP tool execution
  |
  | HTTPS + Authorization: Bearer <upstreamAccessToken>
  v
TVCMall business APIs
```

远程服务使用 Node 内置 HTTP 服务和 MCP SDK 的 `StreamableHTTPServerTransport`。每个 MCP session 都拥有独立的 `McpServer`、transport 与认证上下文，避免用户身份在并发请求间共享。

服务暴露以下端点：

- `POST /mcp`：建立和处理 Streamable HTTP MCP 请求。
- `GET /mcp`：处理 SDK 支持的流式恢复请求；不支持的请求返回规范的 MCP/HTTP 错误。
- `DELETE /mcp`：终止 MCP session。
- `GET /healthz`：只返回服务存活状态，不泄露配置、会话或用户信息。
- `GET /exports/:exportId`：下载已完成的订单导出文件；要求有效 API Key 且该 Key 所属 customer 与导出归属一致。

所有 MCP 端点均要求 API Key。服务从 Key 生成仅内存保存的不可日志化指纹，拒绝 API Key 与既有 session 指纹不一致的请求。认证上下文最多缓存至验证响应的 `expiresAt`，过期后重新调用验证接口；会话销毁时立即清除。

## API Key 验证契约

远程服务通过 `TVCMALL_API_KEY_VERIFY_URL` 调用验证接口：

```http
POST /api/mcp/auth/verify HTTP/1.1
Authorization: Bearer <API_KEY>
Accept: application/json
```

成功响应必须为：

```json
{
  "customer": {
    "id": "customer_123",
    "displayName": "TVCMall Buyer"
  },
  "scopes": ["products:read", "orders:read", "orders:export"],
  "upstreamAccessToken": "short-lived-token",
  "expiresAt": "2026-07-13T12:00:00Z"
}
```

约束如下：

- `customer.id`、至少一个 scope、`upstreamAccessToken` 与有效的 ISO 8601 `expiresAt` 均为必填字段。
- 验证接口返回 `401` 或 `403` 时，MCP 服务返回 HTTP `401`，不区分 API Key 不存在、已撤销或无权使用 MCP。
- 验证接口超时、无效 JSON 或 `5xx` 时，MCP 服务返回 HTTP `503`，并在 tool 层映射为 `API_UNAVAILABLE`；响应不得包含 API Key 或上游原始错误正文。
- MCP 服务向业务 API 发送 `Authorization: Bearer <upstreamAccessToken>`。短期 token 不返回给 MCP Client，也不写入日志。

## Tool 身份与权限

删除 `TokenStore`、`SessionManager` 和 `AuthClient` 对 MCP tool 的运行时依赖，改为不可变的 `RequestAuthContext`：

```ts
interface RequestAuthContext {
  customerId: string;
  displayName: string;
  scopes: string[];
  upstreamAccessToken: string;
  expiresAt: Date;
}
```

tool 注册在创建会话时接收该上下文。每个 tool 先检查所需 scope，再调用对应业务 client。`tvcmall_auth_status` 仅返回已连接状态、显示名和 scope，不返回 API Key、短期 token 或过期时间。

缺失 API Key、API Key 无效、scope 不足、业务 API 不可用和输入不合法，分别使用稳定 HTTP/MCP 错误语义：`401`、`401`、`PERMISSION_DENIED`、`API_UNAVAILABLE` 和 `VALIDATION_ERROR`。旧的“请执行 `npx @tvcmall/mcp login`”引导全部删除。

## 订单导出

远程 MCP 不能在客户电脑直接创建文件。`tvcmall_export_orders` 改为在服务端受控目录创建带时间戳且不可覆盖的导出文件，并返回导出数量、格式、筛选摘要、到期时间及下载 URL。

下载 URL 不包含 API Key。调用 `GET /exports/:exportId` 时必须再次携带 `Authorization: Bearer <API_KEY>`；服务重新验证 Key，并验证 customer ID 与导出归属相同。导出记录和文件在配置的 TTL 到期后删除。导出文件路径、完整订单表、API Key 和短期 token 都不能写入 MCP 响应或日志。

## 配置与部署

部署环境提供以下配置：

| 变量 | 含义 |
| --- | --- |
| `TVCMALL_MCP_HOST` | HTTP 监听地址，默认仅绑定部署环境允许的地址。 |
| `TVCMALL_MCP_PORT` | HTTP 监听端口。 |
| `TVCMALL_MCP_PATH` | MCP 路径，默认 `/mcp`。 |
| `TVCMALL_API_KEY_VERIFY_URL` | API Key 验证接口完整 URL。 |
| `TVCMALL_API_KEY_VERIFY_TIMEOUT_MS` | 验证接口超时。 |
| `TVCMALL_EXPORT_DIR` | 服务端导出临时目录。 |
| `TVCMALL_EXPORT_TTL_MS` | 导出文件保留时长。 |

生产环境必须在 TLS 终止层后部署，并限制对远程服务监听端口的直接访问。反向代理不记录 `Authorization` 请求头；应用日志也必须通过统一脱敏函数过滤该字段及任何 API Key/token 值。

MCP Client 配置仅包含远程地址与 API Key：

```json
{
  "mcpServers": {
    "tvcmall": {
      "url": "https://mcp.tvcmall.com/mcp",
      "headers": {
        "Authorization": "Bearer ${TVCMALL_API_KEY}"
      }
    }
  }
}
```

## 移除项

移除 npm 客户端分发、CLI 的 `server`、`login`、`logout`、`whoami`、`install` 命令，以及本地 Keychain token store、fake auth、refresh 和 `stdio` harness。项目入口改为部署远程服务的运行命令、环境变量和 MCP Client 配置说明。

业务 fake fixtures 可以保留为服务端测试依赖，但它们不再模拟本地登录或 token 持久化。

## 测试与验收

迁移后至少覆盖：

1. 未携带或错误的 API Key 返回 `401`，且响应和日志没有泄露 Key。
2. 正确 API Key 可执行 `initialize`、`tools/list` 与受授权 `tools/call`。
3. 不同 API Key 创建的会话不共享 customer、scope 或业务 token；同一 session 的 Key 不可替换。
4. scope 缺失返回 `PERMISSION_DENIED`；验证接口超时、`5xx` 或无效响应返回安全的 `API_UNAVAILABLE`/`503`。
5. 下游业务 API 收到短期 `Bearer` token，永不收到原始 API Key。
6. 导出文件带时间戳且不覆盖；下载必须重新鉴权并校验所属 customer；过期文件不可下载。
7. 删除 `stdio` 测试，新增真实 Streamable HTTP 协议集成测试，并执行 `npm test`、`npm run typecheck` 和 `npm run build`。
