# Harness Engineering Guide

本项目优先采用 harness engineering：先把 MCP server 的协议边界、假数据、依赖注入和测试支撑做稳定，再逐步替换真实 TVCMall API。目标是让每个 tool 都能在不依赖真实账号、真实后端和本机 Keychain 状态的情况下被重复验证。

## 目标

- 将业务行为放在 `src/tools/` 和各领域 client 接口后面，便于 unit test 和真实 API 替换。
- 将假数据集中放在 `src/fixtures/`，避免散落在 fake client 中导致契约漂移。
- 将 MCP tool 注册集中放在 `src/app/register-tools.ts`，`src/server.ts` 只负责装配依赖。
- 将 stdio 协议测试放进 `tests/integration/`，验证真实 MCP JSON-RPC 边界。
- 测试默认不读写真实系统凭证库，不依赖本机登录状态。

## 当前结构

```text
src/
  app/
    register-tools.ts        # 注册全部 TVCMall MCP tools
  fixtures/
    products.ts              # 商品假数据
    orders.ts                # 订单假数据
    tracking.ts              # 物流假数据
  harness/
    mcp-stdio-harness.ts     # 测试用 stdio JSON-RPC harness
    memory-token-store.ts    # 测试用内存 token store
    stdio-server.ts          # 集成测试专用 server 入口
  config/
    runtime-config.ts        # HTTP API 运行时环境变量读取
  tools/
    *.ts                     # tool 输入输出 schema 与 MCP 业务包装
  */fake-*-client.ts         # 基于 fixtures 的 fake client
tests/
  unit/                      # 直接测试 tool/client/CLI 行为
  integration/
    mcp-stdio.test.ts        # 启动 stdio server 后走 MCP JSON-RPC
```

## Fixtures 规则

- fixtures 是假数据唯一来源；不要在 fake client 内重新硬编码同一批业务样本。
- fixtures 需要符合 `docs/api-contract.md` 中的输出契约。
- fixtures 不放真实客户数据、真实 token、完整地址、电话或邮箱等敏感信息。
- 修改 fixtures 后，需要运行相关领域 unit test，并至少运行 MCP stdio 集成测试。

## 新增 Tool 的推荐步骤

1. 在 `src/tools/<domain>.ts` 定义输入 schema、输出 schema、tool wrapper 和错误映射。
2. 在对应领域定义 client interface；fake client 从 `src/fixtures/` 读取样本数据。
3. 在 `src/app/register-tools.ts` 注册 tool，不把注册逻辑写回 `src/server.ts`。
4. 补充 unit test 覆盖未登录、参数边界、成功返回和错误返回。
5. 如 tool 属于 MCP 对外能力，补充或扩展 `tests/integration/mcp-stdio.test.ts`，确认 `tools/list` 和 `tools/call` 正常。

## Stdio 集成测试

`tests/integration/mcp-stdio.test.ts` 会启动 `src/harness/stdio-server.ts`，再通过 JSON-RPC 调用 MCP 方法。该入口使用 `NullTokenStore`，所以测试结果不受本机 `node dist/index.js login` 或系统凭证库影响。

常用命令：

```bash
npm test -- tests/integration/mcp-stdio.test.ts
npm test
```

stdio 相关测试必须关注两点：

- stdout 只能承载 MCP JSON-RPC 协议消息。
- 普通日志、调试信息和错误栈不能污染 stdout；测试可通过 stderr 断言兜底。

## 真实 API 替换策略

- 保持 tool schema 和错误码稳定，优先替换 client 实现而不是 tool 注册和 tool wrapper。
- 真实 API client 应实现当前领域 interface，例如 `ProductClient`、`OrderClient`、`TrackingClient`。
- 新增真实 API client 后，fake client 和 fixtures 继续保留，用于离线测试、回归测试和契约对照。
- 认证、token refresh 和权限错误需要先映射到 `docs/api-contract.md` 中定义的稳定错误码。
- HTTP API base URL、timeout、API 环境、数据源开关、登录 API `Authorization` header、日志级别和导出目录等运行时配置从 `src/config/runtime-config.ts` 读取；测试应显式传入 env map，不直接依赖开发者本机环境变量。
- token、密码和客户 PII 不属于运行时环境变量，继续通过 CLI 和系统凭证库管理；`TVCMALL_API_AUTHORIZATION` 如为敏感部署凭据，只能通过本机环境或部署注入。
- 真实登录逻辑从 `src/auth/http-auth-client.ts` 和 CLI `login` 命令接入，当前仅覆盖 `docs/external/登录.openapi.yaml` 中已提供的 `/user/login`；默认 fake 模式仍不请求密码。
- 设置 `TVCMALL_DATA_SOURCE=real` 后，server 会对 auth、商品、订单、积分、物流和运费能力装配 HTTP clients；商品、订单、积分、物流和运费 clients 的 `Authorization` header 必须来自 `StoredAuthSession.accessToken`，不能复用 `TVCMALL_API_AUTHORIZATION`。
- 订单号场景下的物流和运费统一落在 `TrackingClient.getTrackingInfo` / `tvcmall_get_tracking_info`；`tvcmall_estimate_shipping` 只作为未下单商品按目的地预估的入口，避免 MCP Client 误选订单详情或运费预估工具。

## 验证基线

结构性重构或 harness 变更提交前，至少运行：

```bash
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

如果改动涉及 stdio server，还需要确认集成测试覆盖启动、`initialize`、`tools/list`、`tools/call`，并确认 stdout 没有非协议日志。
