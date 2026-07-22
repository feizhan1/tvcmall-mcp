# Sandbox 私网 HTTP WebApi 设计

## 目标

允许本地联调环境使用以下类型的 WebApi base URL：

```text
TVCMALL_API_ENV=sandbox
TVCMALL_WEBAPI_BASE_URL=http://192.168.1.16:8084/api/m
```

该例外只服务于本地开发和局域网联调。`production`、`staging` 以及未显式设置环境时继续强制 HTTPS，不降低生产传输安全要求。

## 配置契约

`TVCMALL_WEBAPI_BASE_URL` 继续保持必填，并继续拒绝 userinfo、query 和 fragment。协议与主机规则为：

| `TVCMALL_API_ENV` | URL | 结果 |
| --- | --- | --- |
| `production` | 任意 HTTP | 拒绝启动 |
| `staging` | 任意 HTTP | 拒绝启动 |
| 未设置或非法值 | 任意 HTTP | 按默认 `production` 拒绝启动 |
| 任意合法环境 | HTTPS，无 userinfo/query/fragment | 允许 |
| `sandbox` | HTTP `localhost` | 允许 |
| `sandbox` | HTTP IPv4 loopback `127.0.0.0/8` | 允许 |
| `sandbox` | HTTP RFC1918 `10.0.0.0/8` | 允许 |
| `sandbox` | HTTP RFC1918 `172.16.0.0/12` | 允许 |
| `sandbox` | HTTP RFC1918 `192.168.0.0/16` | 允许 |
| `sandbox` | HTTP IPv6 loopback `::1` | 允许 |
| `sandbox` | HTTP 公网、链路本地、CGNAT 或普通域名 | 拒绝启动 |

不通过 DNS 解析来判断主机是否指向私网。除精确的 `localhost` 外，hostname 必须是 URL 解析后明确的受支持 IP，以避免 DNS rebinding 和启动过程网络依赖。

## 实现边界

`loadRuntimeConfig()` 先解析 `TVCMALL_API_ENV`，再把最终环境传给 WebApi URL 校验器。URL 校验器按以下顺序处理：

1. 确认配置非空且可被 `URL` 解析。
2. 拒绝原始 URL 中的 query 或 fragment 分隔符，包括空 `?` 和 `#`。
3. 拒绝 username 或 password。
4. 允许 HTTPS。
5. 仅当环境为 `sandbox` 时检查 HTTP hostname 是否为受支持 loopback/RFC1918 地址。
6. 拒绝其他协议、环境和主机组合，错误信息不包含原始 URL。

现有 HTTP clients、PAT、session、tool routes 和错误映射都不改变。base URL `http://192.168.1.16:8084/api/m` 与现有 client path 拼接后形成 `/api/m/v3/...` 或 `/api/m/order/...`，继续复用权威接入说明中的 Mobile WebApi routes。

## 安全边界

- 私网 HTTP 例外不由 URL 自身隐式开启；必须显式设置 `TVCMALL_API_ENV=sandbox`。
- 生产和 staging 不提供绕过变量或自动降级。
- HTTP 只影响 MCP Server 到本地 WebApi 的开发链路；MCP Client 到远程 MCP 的生产链路仍必须位于 TLS 终止层后。
- PAT 会在 sandbox 私网 HTTP 链路中以 Bearer Header 传输，因此仅用于可信、隔离的开发网络和可撤销测试 PAT，不使用生产客户 PAT。
- 错误、日志和测试仍不得输出 PAT、完整凭据 URL 或 userinfo。

## 文档更新

以下当前文档同步同一规则：

- `README.md`
- `AGENTS.md`
- `docs/api-contract.md`
- `docs/mvp-scope.md`
- `docs/harness.md`
- `docs/remote-streamable-http-mcp-architecture.md`
- `tvcmall-webapi mcp开发接入说明文档.md`

历史规格保留原始背景并标记归档，不作为当前配置入口。当前文档只使用泛化的 RFC1918 示例；具体局域网地址由开发者通过环境变量注入，不写入生产默认配置。

## 测试与验收

1. `sandbox` 接受 `http://192.168.1.16:8084/api/m`，并原样保留 base path。
2. `sandbox` 接受 `localhost`、`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` 与 `::1`。
3. `production`、`staging` 和默认环境拒绝同一个私网 HTTP URL。
4. `sandbox` 拒绝公网 IP、`169.254.0.0/16`、`100.64.0.0/10`、普通域名和伪装成 localhost 的域名。
5. HTTPS 在所有合法环境继续可用。
6. HTTP/HTTPS URL 的 userinfo、query 和 fragment 继续被拒绝，错误不回显原始 URL 或凭据。
7. runtime config unit tests、完整测试、typecheck、build 和 Streamable HTTP integration tests 全部通过。

