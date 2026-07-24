# Harness Engineering Guide

本项目用 harness engineering 稳定 MCP 协议边界、业务 schemas、fixtures、依赖注入与错误映射。生产入口是远程 Streamable HTTP `/mcp`；仓库中的 stdio harness 只为内部协议和 tool 回归提供兼容适配，不是客户认证、安装或部署入口。

## 目标

- 将业务行为放在 `src/tools/` 与各领域 client interface 后，便于 unit test 和真实 WebApi 替换。
- 将假数据集中放在 `src/fixtures/`，避免 fake client 与契约漂移。
- 将 tool 注册集中放在 `src/app/register-tools.ts`，HTTP transport 与业务逻辑分离。
- 以 Streamable HTTP 集成测试覆盖 PAT、session、`initialize`、`tools/list` 和 `tools/call`。
- 保留内部 stdio 适配器做快速回归，但不让它代替远程认证与 session 测试。
- 默认测试不连接真实 WebApi、不读取客户凭据、不依赖开发者本机状态。

## 结构与职责

```text
src/
  app/
    register-tools.ts        # 注册只读 TVCMall tools
    client-factory.ts        # 装配 fake 或 WebApi clients
  http/
    mcp-http-server.ts       # 远程 Streamable HTTP、PAT 与 session 生命周期
    http-errors.ts           # HTTP 错误响应
    request-body.ts          # 请求正文边界
  auth/
    request-auth-context.ts  # session 内 PAT 与 SHA-256 指纹
  fixtures/                  # 非真实业务样本
  harness/
    mcp-stdio-harness.ts     # 内部 stdio JSON-RPC 适配器
    stdio-server.ts          # 内部集成测试入口
  tools/                     # 输入/输出 schema、摘要和业务 wrapper
  */fake-*-client.ts         # fixtures 驱动的 fake client，包含余额流水
  */http-*-client.ts         # 现有 TVCMall WebApi route client，包含余额流水
tests/
  unit/                      # schema、tool、session、client 和错误映射
  integration/               # Streamable HTTP 与内部 stdio 协议测试
```

## Fixtures 规则

- fixtures 是 fake client 的唯一业务样本来源；不要在 fake client 或测试中复制整份响应。
- fixtures 必须符合 `docs/api-contract.md` 的 tool 输出契约，并与外部 OpenAPI 样例保持可追踪关系；余额流水 fixture 不得复制上游 `UserID`。
- fixtures 只能使用虚构用户、订单号、地址和物流数据，不得包含真实客户数据或真实 PAT。
- 如测试需要认证值，只能使用显然虚假的格式样本，例如 `tmcp_v1_test-id.test-secret`；不得从环境变量读取后写入快照。
- 修改 fixtures 后，运行相关领域 unit tests、Streamable HTTP 集成测试和必要的内部 stdio 回归。

## Tool 开发流程

1. 在 `src/tools/<domain>.ts` 定义 Zod 输入/输出 schema、tool wrapper 和 AI 友好摘要。
2. 在对应领域定义 client interface；fake client 读取 fixtures，HTTP client 调用现有 WebApi route。
3. 在 `src/app/register-tools.ts` 注册 tool，不把业务逻辑写进 transport。
4. 补 unit tests 覆盖参数边界、成功摘要、空结果和稳定错误映射。
5. 确认目标 HTTP method + normalized route 已在 WebApi allowlist 登记为 `catalog.read` 或 `order.read`。
6. 扩展 Streamable HTTP 集成测试，验证持有同一 PAT 的 session 能执行 `tools/list` / `tools/call`。

tool 层不得从 PAT 推断用户或 scopes，也不得以本地权限列表代替 WebApi 授权。

## Streamable HTTP 集成边界

远程协议测试至少覆盖：

- `POST /mcp` initialize 要求 `TVCMALL_API_KEY: tmcp_v1_...`；旧入站 `Authorization` 和双凭据请求必须被拒绝。
- 初始化响应返回 `Mcp-Session-Id`；后续 `POST`、`GET`、`DELETE` 必须携带该 ID 和同一 PAT。
- 缺失、格式错误或替换 `TVCMALL_API_KEY` 返回安全的 `AUTH_REQUIRED`，响应不包含任一 PAT。
- 未知、已删除、idle TTL 过期或 server close 后的 session 不可继续使用。
- 最大 session 容量包含并发初始化，达到上限后稳定拒绝新 session。
- `tools/list` 不暴露写操作或文件型能力；`tools/call` 只返回摘要与受控 structured content。
- transport `onclose`、`DELETE`、idle TTL 和 server close 都清理 session 认证上下文。

HTTP harness 应使用本地监听端口和 stub/fake 依赖，不请求生产域名。PAT 泄漏断言应检查响应正文、错误文本、捕获日志和快照。

## 内部 stdio 适配器

`tests/integration/mcp-stdio.test.ts` 与 `src/harness/stdio-server.ts` 可用于验证 MCP JSON-RPC、tool schemas 和注册结果。它不具备以下证明能力：

- 客户端每请求携带 PAT。
- `Mcp-Session-Id` 与 SHA-256 指纹绑定。
- HTTP `POST` / `GET` / `DELETE` 生命周期、容量和 idle TTL。
- WebApi Bearer PAT 透传与 HTTP 错误映射。

因此 stdio 结果不能作为远程认证或生产部署验收证据。该内部入口不创建远程 HTTP logger，stdout 仍只能承载 MCP JSON-RPC，且正常的内部 stdio 回归不输出普通日志到 stderr；远程服务的安全 JSON 诊断日志只由 HTTP 入口写入 stderr。

常用内部回归命令：

```bash
npm test -- tests/integration/mcp-stdio.test.ts
```

## WebApi client 测试

每个真实 HTTP client 都应通过注入 fetch/stub server 验证：

- base URL 来自 `TVCMALL_WEBAPI_BASE_URL`，始终拒绝 userinfo/query/fragment。`TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`，仅 `value?.trim() === 'true'` 启用 HTTP 覆盖；开关关闭时，只有显式 `sandbox` 可使用 loopback 或 RFC1918 HTTP。
- 开关严格设为 `true` 后，`production`、`staging`、`sandbox` 及其他环境均可使用任意 host/port 的 HTTP WebApi。PAT、请求和响应会经过明文链路，风险由部署人员承担，只能用于受控网络的临时调试。
- 出站覆盖不改变 MCP Client 到 `/mcp` 的 HTTPS/TLS 要求、PAT 仅在当前 session 内存并在 `DELETE` / `onclose` / idle TTL / server close 时清理的生命周期，或日志、异常和 tool 输出的强制脱敏。
- URL 使用现有 TVCMall WebApi route，不创建 MCP 专用业务 route。
- 当前 session PAT 原样进入 WebApi `Authorization: Bearer <PAT>`，且 `Bearer ` 只增加一次。
- request schema、分页和批量上限与 tool 契约一致。
- WebApi 响应先转换为受控领域对象，再由 tool 生成摘要；不透传超大原始正文。
- `401`、`403`、`429`、`5xx`、网络、超时和 body read failure 映射到稳定错误码，且错误不包含响应正文或 PAT。

测试 MCP 层时应使用 fake/stub WebApi；测试 WebApi response mapping 时优先使用 `docs/external/` 中脱敏后的契约样例。

本地 sandbox 联调可使用 `.env.local` 与 `npm run dev:local`，但 `.env.local` 必须被 Git 忽略且不含 `TVCMALL_API_KEY` 或 PAT。默认情况下，它只连接隔离网络中的 loopback/RFC1918 HTTP WebApi，并使用可撤销测试 PAT；如需临时调试任意 HTTP host/port，必须显式设置严格 `true` 的 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 并承担明文链路风险。自动化测试仍优先使用 stub/fake 依赖。

## 真实 HTTP 集成

自动化测试默认不得访问真实环境。需要验证 staging WebApi 时：

1. 由 CI 或受控 shell secret 注入 staging MCP URL 与测试 PAT，不写入仓库文件。
2. 使用专用、最小 scope、可撤销的测试 PAT，禁止复用生产客户 PAT。
3. 只调用 allowlist 中的只读 route，并限制请求数量和返回数据范围。
4. 捕获日志前确认代理、HTTP client 和测试 runner 会过滤入站 `TVCMALL_API_KEY` 与出站 `Authorization`。
5. 测试结束立即销毁 MCP session；PAT 轮换或撤销由 TVCMall 后端流程负责。

真实集成至少验证一次 `catalog.read` 和一次 `order.read`；它用于确认 WebApi → ApplicationServices → RDS 的最终授权，不用于扩展 MCP 本地权限逻辑。

## 验证基线

结构性重构或 harness 变更提交前，至少运行：

```bash
npm test -- tests/unit/mcp-http-server.test.ts
npm test -- tests/integration/mcp-streamable-http.test.ts
npm run typecheck
npm run build
npm test
git diff --check
```

若仓库暂时没有某个列出的集成测试文件，应先补最小可运行测试，或在交付说明中明确替代验证命令与未覆盖风险。
