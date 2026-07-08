# TVCMall Customer MCP

TVCMall Customer MCP 是面向 TVCMall 客户、采购商、分销商和店铺运营人员的本地 MCP server。客户在自己的电脑上安装后，可以通过 Claude、Cursor、Codex 或其他 MCP Client 查询 TVCMall 商品、订单、物流，并将订单导出为本地文件。

> 当前状态：v0.1 最小 TypeScript 骨架已初始化，已包含 stdio MCP server、商品域假数据 tools、订单/物流假数据 tools、`tvcmall_export_orders` CSV 假数据导出、基础 CLI、系统凭证库 token store、fake auth 的 login/refresh/logout/me、过期自动 refresh、测试与构建脚本。真实业务 API 仍待接入。

## 文档地图

- `AGENTS.md`：AI Agent 在本仓库工作的规则，包含中文交流、安全边界、测试与文档维护要求。
- `docs/mvp-scope.md`：v0.1 项目定位、MVP 范围、架构、实施阶段、验收标准和主要风险。
- `docs/api-contract.md`：CLI、认证接口、token 策略、MCP tools、后端 API、scope、错误码和订单导出契约。
- `docs/harness.md`：harness engineering 结构、fixtures 规则、stdio 集成测试和真实 API 替换策略。
- `docs/tvcmall-customer-mcp-v0.1-implementation.md`：历史实施资料索引，后续只做导航，不再维护长篇重复内容。

## v0.1 核心范围

v0.1 是客户侧本地 MCP，默认只读。

首批能力：

- 商品查询：搜索商品、查看商品详情。
- 运费估算：根据商品和目的地估算运输费用。
- 订单查询：查看订单列表和订单详情。
- 积分查询：查看客户积分和积分记录。
- 物流查询：查询单个或批量订单的物流状态。
- 订单导出：将订单导出为本地 `xlsx` 或 `csv` 文件。

v0.1 不做：

- 下单。
- 支付。
- 修改地址。
- 取消订单。
- 其他会改变 TVCMall 业务状态的写操作。

## 本地开发

```bash
npm install
npm test
npm run typecheck
npm run build
node dist/index.js login
node dist/index.js whoami
```

当前认证使用本地假数据：`login` 会保存 `fake.customer@example.com` 的 fake token session 到系统凭证库，`whoami` 和 MCP `tvcmall_auth_status` 会在 session 过期时自动 refresh，`logout` 会先调用 fake logout 再清除本地 session；这些命令不会请求密码，也不会连接 TVCMall 后端。

## HTTP API 环境变量

后续接入真实 TVCMall HTTP API 时，运行时配置通过环境变量读取；当前 fake client 不会连接真实后端。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `TVCMALL_API_BASE_URL` | `https://api.tvcmall.com` | 真实 TVCMall API base URL |
| `TVCMALL_API_TIMEOUT_MS` | `15000` | HTTP 请求超时时间，单位毫秒 |
| `TVCMALL_API_ENV` | `production` | API 环境：`production`、`staging` 或 `sandbox` |
| `TVCMALL_DATA_SOURCE` | `fake` | 数据源：`fake` 使用本地 fixtures，`real` 使用真实 HTTP API |
| `TVCMALL_API_AUTHORIZATION` | 未设置 | `/user/login` 所需的 `Authorization` header，来自后端接口文档或部署配置 |
| `TVCMALL_LOG_LEVEL` | `info` | 日志级别：`silent`、`error`、`warn`、`info`、`debug` |
| `TVCMALL_EXPORT_DIR` | 未设置 | 默认订单导出目录 |

不要把 `access_token`、`refresh_token`、密码或客户 PII 放进环境变量；用户 token 继续通过 CLI login 写入系统凭证库。`TVCMALL_API_AUTHORIZATION` 只用于登录接口，如属于敏感部署凭据，也不要提交到仓库。真实数据模式下，商品、订单、积分、物流和运费 API 的 `Authorization` header 来自登录后保存的 `session.accessToken`。

## Harness 化开发

当前代码按 harness engineering 方式组织：`src/server.ts` 只装配依赖，MCP tool 注册集中在 `src/app/register-tools.ts`；假数据集中放在 `src/fixtures/`；测试支撑放在 `src/harness/`；stdio 集成测试通过真实 MCP JSON-RPC 调用验证 `initialize`、`tools/list` 和 `tools/call`。

常用验证命令：

```bash
npm test -- tests/integration/mcp-stdio.test.ts
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

详细规则见 `docs/harness.md`。

## 规划中的客户使用方式

```bash
npx @tvcmall/mcp login
npx @tvcmall/mcp install claude
```

MCP Client 配置目标示例：

```json
{
  "mcpServers": {
    "tvcmall": {
      "command": "npx",
      "args": ["-y", "@tvcmall/mcp", "server"]
    }
  }
}
```

客户可以在 MCP Client 中提问：

```text
帮我查找 TVCMall 上适合 iPhone 的手机壳
查询我最近 10 个订单
导出上个月已发货订单
批量查询这些订单的物流状态
```

## 安全原则

- 登录必须通过独立 CLI 完成，例如 `npx @tvcmall/mcp login`。
- 不设计接收密码的 MCP tool。
- MCP server 的 stdout 只输出 MCP JSON-RPC 协议内容。
- 普通日志写入 stderr 或日志文件。
- 不保存明文密码。
- 不在日志、stdout 或 AI 对话中输出 access token、refresh token、密码、完整地址、电话等敏感信息。
- 订单详情、物流信息和导出文件必须遵循后端权限与脱敏策略。

## 推荐技术栈

- Node.js 20+
- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`
- Node 内置 `fetch` 或 `undici`
- `commander` 或同类 CLI 框架
- `keytar`
- `xlsx` 或 `exceljs`
- `vitest`

## 建议源码结构

```text
tvcmall-mcp/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    server.ts
    app/
      register-tools.ts
    cli/
      login.ts
      logout.ts
      whoami.ts
      install.ts
    config/
      runtime-config.ts
    fixtures/
      products.ts
      orders.ts
      tracking.ts
    harness/
      mcp-stdio-harness.ts
      memory-token-store.ts
      stdio-server.ts
    tools/
      auth-status.ts
      products.ts
      orders.ts
      tracking.ts
      export-orders.ts
    api/
      http-client.ts
      auth-client.ts
      products-client.ts
      orders-client.ts
      shipping-client.ts
    storage/
      token-store.ts
      config-store.ts
    export/
      csv-exporter.ts
      xlsx-exporter.ts
    security/
      redact.ts
      scopes.ts
    errors/
      mcp-errors.ts
    types/
      tvcmall.ts
  tests/
    unit/
    integration/
```

## 下一步

1. 确认后端 MCP Auth API 契约，尤其是 token、scope、refresh、logout。
2. 将当前 fake login 替换为真实 `/api/mcp/auth/login`、`refresh`、`logout`、`me` 接口。
3. 将当前 fake 商品域 tools 替换为真实 `/api/mcp/products/search`、`/api/mcp/products/{id}`、`/api/mcp/shipping/estimate`。
4. 将当前 fake 订单/物流 tools 替换为真实 `/api/mcp/orders`、`/api/mcp/orders/{id}`、`/api/mcp/orders/{id}/tracking`、`/api/mcp/orders/tracking/batch`。
5. 将当前 CSV 订单导出扩展为真实订单分页导出，并补充 `xlsx` 实现。
6. 内部发布 npm beta，用 1-2 个测试账号跑完整链路。
7. 实现 `install claude`、`install cursor`、`install codex` 自动配置命令。

## 参考资料

- [TVCMall Open API 文档](https://tvcmall.apifox.cn/)
- [TVCMall API 介绍文章](https://www.tvcmall.com/blog/inside-tvcmall/how-tvcmall-api-improves-e-commerce-efficiency-product-order-shipping-integration-guide.html)
- [Model Context Protocol SDK 文档](https://modelcontextprotocol.io/docs/sdk)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
