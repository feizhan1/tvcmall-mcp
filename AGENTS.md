# AGENTS.md

## 1. 交流规则

- 默认使用中文交流，包括说明、计划、评审意见和最终回复。
- 技术名词、命令、文件路径、错误码、API 字段名可以保留英文原文。
- 回复要直接、可执行；涉及代码或文档修改时，说明改了什么、为什么改、如何验证。

## 2. 本文件定位

- `AGENTS.md` 只记录 AI Agent 在本仓库工作的稳定规则，不承载长篇产品方案或一次性讨论记录。
- 项目入口在 `README.md`，MVP 范围在 `docs/mvp-scope.md`，API 契约在 `docs/api-contract.md`，远程架构在 `docs/remote-streamable-http-mcp-architecture.md`。
- MCP 调用 TVCMall WebApi 的认证授权以根目录 `tvcmall-webapi mcp开发接入说明文档.md` 为准。
- 业务方案、接口契约或验收范围变化时优先更新 `docs/`；只有影响 Agent 工作方式的稳定规则才写入本文件。

## 3. 项目背景

- 项目名称：`TVCMall Customer MCP`。
- 目标形态：部署在 TVCMall 基础设施中的远程 Streamable HTTP MCP Server，MCP Client 通过 HTTPS `/mcp` 使用。
- v0.1 核心能力：商品、订单、物流、运费和积分只读查询。
- v0.1 不提供文件导出能力；除非用户明确提出并完成安全评审，不实现下单、支付、改地址、取消订单、积分兑换等写操作。

## 4. 认证与安全边界

- MCP Client 必须在每个远程 `/mcp` 请求中携带 `TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}`，不得发送入站 `Authorization`，也不得使用网站用户名密码、OAuth token 或服务器共享 PAT。
- MCP HTTP 层只做 API KEY/PAT 基本格式、请求 schema、SHA-256 session 指纹绑定、容量和 idle TTL 控制；不得自行判断用户、scope、过期时间或调用独立验证服务。
- 调用业务接口时原样使用当前 session 的 PAT，只增加一次 `Bearer ` 前缀，并且只发送给 `TVCMALL_WEBAPI_BASE_URL` 下的现有 WebApi route。
- MCP Server 不直连 ApplicationServices 或 RDS。WebApi → ApplicationServices → RDS 负责 PAT verifier、`catalog.read` / `order.read`、method + normalized route allowlist 和业务权限。
- PAT 原文只允许存在于当前 MCP session 的内存认证上下文；SHA-256 指纹只用于同 session 比对。`DELETE /mcp`、transport `onclose`、idle TTL 或 server close 后必须清理。
- 禁止把 PAT、入站 `TVCMALL_API_KEY`、出站 `Authorization`、密码、完整地址、电话等敏感信息打印到日志、异常、HTTP 响应或 MCP tool 输出。
- 订单详情和物流信息涉及 PII 时，必须遵循 WebApi 后端权限与脱敏策略。
- stdout 纯协议约束只适用于内部 stdio harness；远程生产入口使用 HTTP，应用日志仍必须结构化、脱敏并与协议响应分离。

## 5. 工具与接口设计约定

- 本期 tools 仅覆盖 `tvcmall_auth_status`、商品、订单、物流、运费和积分只读查询。
- `tvcmall_auth_status` 只返回 `{ configured: boolean }`，表示 PAT 是否配置到当前 session，不表示 WebApi 已验证 PAT。
- tool 输入必须做 schema 校验，优先使用 `zod`；分页和批量查询必须设置默认值与上限。
- tool 输出应提供 AI 友好摘要与受控结构化内容，不原样透出超大 WebApi 响应、PAT 或完整 PII。
- 只复用权威接入说明列出的现有 WebApi route；不得新增 `/api/mcp/v1/...` 业务 route，也不得在 MCP 侧绕过 route allowlist。
- WebApi `401` 映射为 `AUTH_REQUIRED`，`403` 映射为 `PERMISSION_DENIED`，`429` 映射为 `RATE_LIMITED`，`5xx`、网络、超时和正文读取失败映射为 `API_UNAVAILABLE`。
- `TVCMALL_WEBAPI_BASE_URL` 必须显式配置为 HTTPS URL，且不得包含 userinfo、query 或 fragment。

## 6. 建议目录结构

如需演进源码，应保持现有风格并优先采用以下职责划分：

```text
tvcmall-mcp/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    server.ts
    http/
      mcp-http-server.ts
      http-errors.ts
      request-body.ts
    auth/
      request-auth-context.ts
    app/
      register-tools.ts
      client-factory.ts
    tools/
      auth-status.ts
      products.ts
      orders.ts
      tracking.ts
      shipping.ts
      points.ts
    products/
    orders/
    tracking/
    shipping/
    points/
    security/
      redact.ts
    errors/
      mcp-errors.ts
  tests/
    unit/
    integration/
```

## 7. 技术栈偏好

- Node.js 20+、TypeScript。
- MCP SDK：`@modelcontextprotocol/sdk`，远程传输使用 Streamable HTTP。
- 参数校验：`zod`。
- HTTP：Node 内置 `fetch` 或 `undici`。
- 测试：`vitest`，覆盖 HTTP session、PAT 指纹绑定、tools 和 WebApi client。

## 8. 开发与验证要求

- 修改代码时优先补充或更新测试；至少运行与本次修改相关的单元测试或集成测试。
- 涉及 Streamable HTTP 的改动，必须覆盖 `initialize`、`Mcp-Session-Id`、后续 `POST` / `GET` / `DELETE`、PAT 不可替换、最大 session 数和 idle TTL 清理。
- 涉及认证、HTTP header、日志或异常的改动，必须断言 `TVCMALL_API_KEY`、PAT 和下游 `Authorization` 不会出现在日志、错误正文、tool 输出和测试快照中。
- 涉及 WebApi client 的改动，必须验证 PAT 原样且只加一次 `Bearer `，并验证稳定的 `401` / `403` / `429` / `5xx` 错误映射。
- 涉及 harness、fixtures、tool 注册或 fake client 的改动，优先保持业务行为不变，并同步维护 `docs/harness.md`。
- 内部 stdio harness 只用于协议与 tool 回归，不能作为客户认证、安装或生产部署入口；其 stdout 不得被普通日志污染。
- fixtures 不得包含真实 PAT、真实客户数据、完整地址、电话或邮箱。
- 如果当前仓库还没有适用测试，先说明验证方式；新增代码时同步建立最小可运行测试。

## 9. 文档维护要求

- 项目入口、远程部署和 MCP Client URL + PAT 配置维护在 `README.md`。
- 项目方案、实施阶段、验收标准和风险维护在 `docs/mvp-scope.md`。
- PAT header、session、现有 WebApi routes、MCP tools、scope、错误码维护在 `docs/api-contract.md`。
- 部署拓扑、信任边界、技术架构图和数据流转图维护在 `docs/remote-streamable-http-mcp-architecture.md`。
- harness 结构、fixtures、内部 stdio 适配和真实 HTTP 集成测试说明维护在 `docs/harness.md`。
- `docs/tvcmall-customer-mcp-v0.1-implementation.md` 只作为历史实施资料索引，不再维护长篇重复内容。
- 不要把临时计划、长篇会议记录或一次性分析塞回 `AGENTS.md`。
