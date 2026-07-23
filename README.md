# TVCMall Customer MCP

TVCMall Customer MCP 是部署在 TVCMall 基础设施中的远程 Streamable HTTP MCP Server。Claude、Cursor、Codex 或其他 MCP Client 通过 HTTPS `/mcp` 连接，并在每个请求中携带 TVCMall 签发的 Personal Access Token（PAT）。客户无需在本机安装本项目、运行登录 CLI 或保存网站账号密码。

当前 v0.1 提供商品、订单、物流、运费、积分和余额流水的只读查询。MCP Client 通过 `TVCMALL_API_KEY` 发送原始 PAT；MCP Server 调用现有 TVCMall WebApi 时转换为 `Authorization: Bearer <PAT>`。WebApi、ApplicationServices 与 RDS 负责 PAT 校验、scope 和 method + normalized route allowlist 授权。

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
查下余额流水
查看余额消耗流水
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
| `tvcmall_list_balance_records` | 分页查看余额获取和消耗流水 | `order.read` |

`tvcmall_auth_status` 的结果只有 `{ "configured": true | false }`，表示 PAT 是否存在于当前 MCP session，不表示 WebApi 已验证该 PAT。

`tvcmall_list_point_records` 当前调用 `/api/v3/user/points/list`；该 method + route 投产前必须由 WebApi/ApplicationServices 团队登记到 `order.read` allowlist。未登记时 WebApi 会返回 `403`，MCP 映射为 `PERMISSION_DENIED`，MCP Server 不会绕过授权。

`tvcmall_list_balance_records` 调用已登记的 `GET /api/v3/user/balance/list`。输入 `direction` 默认为 `all`，也可设为 `income`（获取）或 `expense`（消耗）；单页默认 20 条、最多 50 条。结果不会返回上游的 `UserID`。

v0.1 不提供文件导出能力，也不开放下单、支付、改地址、取消订单、积分兑换等写操作。tool 返回 AI 友好摘要和受 schema 约束的结构化数据，不返回 PAT、完整上游响应或不必要的 PII。

## 远程部署

本节供 TVCMall 服务运维与开发人员使用；它不是客户本地安装流程。

```bash
npm install
npm test
npm run typecheck
npm run build
TVCMALL_API_ENV=production TVCMALL_WEBAPI_BASE_URL=https://webapi.example.com/api npm start
```

生产环境应把服务部署在 TLS 终止层后，只暴露 `/mcp` 和无敏感信息的 `/healthz`。反向代理与应用日志都不得记录入站 `TVCMALL_API_KEY`、出站 `Authorization` 或 PAT。MCP Server 不配置服务器共享 PAT；PAT 只能由各 MCP Client 在请求头中提供。

### Docker 构建与推送

先通过阿里云控制台提供的凭据登录镜像仓库，再在仓库根目录执行：

```bash
docker login crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com
./scripts/docker-build-push-stage.sh
```

预发布脚本默认推送到 `tvcmall-mcp`，生产脚本默认推送到 `tvcmall-product-mcp`：

```bash
./scripts/docker-build-push-stage.sh
./scripts/docker-build-push-product.sh
```

两个脚本均默认构建 `linux/amd64` 镜像，并以当前 Git 提交短 SHA 和 `latest` 两个标签推送。需要显式指定标签或通过专有网络推送时，可覆盖环境变量：

```bash
IMAGE_TAG=release-20260723 ./scripts/docker-build-push-stage.sh
IMAGE_REPOSITORY=crpi-xjd40982wqk3bdon-vpc.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-mcp ./scripts/docker-build-push-stage.sh
IMAGE_REPOSITORY=crpi-xjd40982wqk3bdon-vpc.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-product-mcp ./scripts/docker-build-push-product.sh
```

脚本不会保存或输出 Docker 登录密码；生产运行容器时仍必须提供 `TVCMALL_WEBAPI_BASE_URL`。

### Docker Compose 部署

`compose.staging.yaml` 和 `compose.production.yaml` 只部署 MCP 服务，不保存 PAT、Docker 登录凭据或客户数据。两个文件分别固定 `TVCMALL_API_ENV=staging` 和 `TVCMALL_API_ENV=production`，不能通过外部变量覆盖。

预发布部署：

```bash
export TVCMALL_MCP_IMAGE=crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-mcp:1ee30ec
export TVCMALL_WEBAPI_BASE_URL=https://staging-webapi.example.com/api
docker compose -f compose.staging.yaml up -d
```

生产部署：

```bash
export TVCMALL_MCP_IMAGE=crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-product-mcp:1ee30ec
export TVCMALL_WEBAPI_BASE_URL=https://webapi.example.com/api
docker compose -f compose.production.yaml up -d
```

部署主机位于阿里云深圳 VPC 时，可将镜像地址的 registry host 替换为 `crpi-xjd40982wqk3bdon-vpc.cn-shenzhen.personal.cr.aliyuncs.com`，通过专有网络拉取同一镜像。

Compose 默认将容器 `3000` 端口绑定到宿主机 `127.0.0.1:8090`，供宿主机的 TLS 反向代理访问。仅在受控的内网中确有需要时，才指定对外绑定地址或变更宿主机端口：

```bash
TVCMALL_MCP_BIND_ADDRESS=0.0.0.0 TVCMALL_MCP_PORT=8080 docker compose -f compose.production.yaml up -d
```

服务包含 `/healthz` 健康检查并配置为 `unless-stopped` 自动重启。更新不可变镜像标签后，执行 `docker compose -f compose.production.yaml pull && docker compose -f compose.production.yaml up -d`；预发布环境将命令中的文件替换为 `compose.staging.yaml`。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TVCMALL_WEBAPI_BASE_URL` | 无，必填 | 现有 TVCMall WebApi 基础 URL；必须包含实际基础路径（示例 `/api`）；`production` / `staging` 必须使用 HTTPS，`sandbox` 才可受限使用私网 HTTP；不得包含 userinfo、query 或 fragment |
| `TVCMALL_API_TIMEOUT_MS` | `15000` | WebApi 请求超时，单位毫秒；合法范围 `1..2_147_483_647` |
| `TVCMALL_API_ENV` | `production` | API 环境标识：`production`、`staging` 或 `sandbox`；未设置或非法值按 `production` 处理 |
| `TVCMALL_MCP_HOST` | `127.0.0.1` | HTTP 监听地址；生产环境通常由反向代理访问 |
| `TVCMALL_MCP_PORT` | `3000` | HTTP 监听端口 |
| `TVCMALL_MCP_PATH` | `/mcp` | Streamable HTTP MCP 路径 |
| `TVCMALL_LOG_LEVEL` | `info` | 日志级别；远程 HTTP 服务默认输出安全诊断日志，只有 `silent` 完全关闭 |

`TVCMALL_WEBAPI_BASE_URL` 不提供隐式生产默认值，以免误连环境；例如现有 route 是 `/api/v3/...` 时，base URL 应以 `/api` 结尾，client 再追加 `/v3/...`。MCP Server 只为 PAT 增加一次 `Bearer ` 前缀，并复用接入说明中列出的现有 WebApi route；不会新增 MCP 专用业务 route、调用独立验证服务或交换 token。

远程 Streamable HTTP 服务把诊断日志写到 stderr，每行一个 JSON 对象。未设置时 `info` 会记录服务启动、MCP HTTP 请求完成和已执行 tool 的结果；`debug` 额外记录 session 生命周期，`warn` / `error` 只保留对应严重级别，明确设置 `silent` 才完全不输出普通日志。日志字段只包括事件名、method/status、JSON-RPC method、预定义 tool 名、稳定错误码和耗时，绝不包含 `TVCMALL_API_KEY`、PAT、`Authorization`、请求参数、session ID、WebApi 原始响应或 PII。

当 tool 的下游 WebApi 调用失败时，`mcp_tool_completed` 还会安全地记录 `webApiMethod`、`normalizedRoute`、`webApiStatus` 和每次请求生成的 UUID `traceId`。如果 WebApi 在 `403` 响应中返回受控的 `X-TVCMall-MCP-Auth-Reason`，日志可额外包含 `authReason`（仅 `scope_missing`、`route_not_registered` 或 `route_disabled`）。例如：

```json
{"timestamp":"2026-07-23T08:39:35.918Z","level":"warn","event":"mcp_tool_completed","toolName":"tvcmall_get_points","outcome":"error","errorCode":"PERMISSION_DENIED","webApiMethod":"GET","normalizedRoute":"api/v3/user/points/stat","webApiStatus":403,"traceId":"7f4b64e0-6f3c-4f8c-a3ac-97e0c99f4941","authReason":"scope_missing","durationMs":1685}
```

`traceId` 不由 PAT、session 或请求参数派生。值为空、缺失或不在白名单内的拒绝原因不会写入日志，也不会改变授权结果。排查 `PERMISSION_DENIED` 时，先从 MCP 日志取得 `traceId`，再在 WebApi/ApplicationServices 的安全审计日志中查询对应的 method、normalized route 和授权决策；不要通过打开 WebApi 原始响应日志排查。

`HTTPS` 在所有合法环境均可使用。`production`、`staging`、未设置环境或非法环境均强制 `HTTPS`。只有显式 `TVCMALL_API_ENV=sandbox` 时，才允许 `http://` 指向 `localhost`、`[::1]`、`127.0.0.0/8` 或 RFC1918 地址段（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）。此校验不做 DNS 解析；普通域名、公网、链路本地 `169.254.0.0/16`、CGNAT `100.64.0.0/10` 与其他 IPv6 地址都被拒绝。所有环境仍拒绝 URL userinfo、query 和 fragment。

### 本地 sandbox 联调

本项目提供 `.env.example` 作为无敏感信息的模板。仅在隔离网络中，将它复制为被 Git 忽略的 `.env.local`，再替换为本机或受控 RFC1918 WebApi 地址：

```bash
cp .env.example .env.local
npm run dev:local
```

`npm run dev:local` 和构建后的 `npm run start:local` 才会显式读取 `.env.local`；原 `npm run dev`、`npm start` 和生产部署仍由平台注入环境变量。`.env.local` 不得保存 `TVCMALL_API_KEY` 或 PAT，PAT 只能由 MCP Client 在每个请求中提供。sandbox HTTP 仅用于隔离网络和可撤销测试 PAT，不能降低公网 `/mcp` 的 HTTPS/TLS 要求，也不能使用生产客户 PAT。

本地联调默认会在运行 `npm run dev:local` 的终端 stderr 显示安全诊断日志；如需静默运行，显式设置 `TVCMALL_LOG_LEVEL=silent`。

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
| `403 PERMISSION_DENIED` | PAT 缺少 `catalog.read` / `order.read`，或目标 method + route 未在 allowlist 启用；使用同一条 tool 日志的 `traceId` 查询 WebApi/ApplicationServices 授权决策，并联系 TVCMall 管理员 |
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
