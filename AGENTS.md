# AGENTS.md

## 1. 交流规则

- 默认使用中文交流，包括说明、计划、评审意见和最终回复。
- 技术名词、命令、文件路径、错误码、API 字段名可以保留英文原文。
- 回复要直接、可执行；涉及代码或文档修改时，说明改了什么、为什么改、如何验证。

## 2. 本文件定位

- `AGENTS.md` 只记录 AI Agent 在本仓库工作的稳定规则，不承载长篇产品方案或一次性讨论记录。
- TVCMall Customer MCP v0.1 的项目入口在 `README.md`，MVP 范围在 `docs/mvp-scope.md`，API 契约在 `docs/api-contract.md`。
- 后续如果业务方案、接口契约、验收范围变化，优先更新 `docs/` 下的项目文档；只有影响 Agent 工作方式的规则才写入本文件。

## 3. 项目背景

- 项目名称：`TVCMall Customer MCP`。
- 目标形态：客户本地安装的 stdio MCP server，通过 Claude / Cursor / Codex / 其他 MCP Client 使用。
- v0.1 核心能力：商品查询、订单查询、物流查询、本地订单导出。
- v0.1 默认只读；除非用户明确提出并完成安全评审，不实现下单、支付、改地址、取消订单等写操作。

## 4. 安全边界

- 登录必须通过独立 CLI 命令完成，例如 `npx @tvcmall/mcp login`；不要设计接收密码的 MCP tool。
- `server` 模式使用 stdio 传输 MCP JSON-RPC，stdout 只能输出协议内容；普通日志必须写 stderr 或日志文件。
- 禁止保存明文密码；token 优先放系统凭证库，无法使用时才考虑本地加密文件。
- 禁止把 access token、refresh token、密码、完整地址、电话等敏感信息打印到日志、stdout 或 AI 对话中。
- 订单详情、物流信息、导出文件涉及 PII 时，必须遵循后端权限与脱敏策略。

## 5. 工具与接口设计约定

- MCP tools 只使用已保存 token；未登录时返回清晰引导：提示用户在终端执行 `npx @tvcmall/mcp login`。
- tool 输入必须做 schema 校验，优先使用 `zod`；分页、批量查询和导出范围必须设置默认值和上限。
- tool 输出应面向 AI 友好摘要，不要原样透出超大的后端响应。
- 订单导出只返回本地文件路径、数量、格式和筛选摘要，不在 AI 对话中输出完整订单表。
- 后端错误需要映射为稳定错误码，例如 `AUTH_REQUIRED`、`TOKEN_EXPIRED`、`PERMISSION_DENIED`、`RATE_LIMITED`、`VALIDATION_ERROR`、`API_UNAVAILABLE`、`EXPORT_TOO_LARGE`。

## 6. 建议目录结构

如需初始化源码，优先采用以下结构；若实际项目已有结构，应在保持既有风格的前提下演进。

```text
tvcmall-mcp/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    server.ts
    cli/
      login.ts
      logout.ts
      whoami.ts
      install.ts
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

## 7. 技术栈偏好

- Node.js 20+、TypeScript。
- MCP SDK：`@modelcontextprotocol/sdk`。
- 参数校验：`zod`。
- CLI：`commander` 或同类轻量方案。
- HTTP：Node 内置 `fetch` 或 `undici`。
- 表格导出：优先支持 `xlsx`，可同时支持 `csv`。
- 测试：`vitest`，并根据需要补充 MCP server 启动和 CLI 集成测试。

## 8. 开发与验证要求

- 修改代码时优先补充或更新测试；至少运行与本次修改相关的单元测试或集成测试。
- 涉及 stdio MCP server 的改动，必须验证 stdout 没有普通日志污染。
- 涉及认证、token、日志、导出的改动，必须检查敏感信息不会泄露。
- 涉及导出功能的改动，必须验证文件名带时间戳、不会覆盖已有文件，并且返回摘要而不是完整表格。
- 如果当前仓库还没有测试框架，先说明验证方式；新增代码时同步建立最小可运行测试。

## 9. 文档维护要求

- 项目入口、客户安装和使用说明维护在 `README.md`。
- 项目方案、实施阶段、验收标准和风险维护在 `docs/mvp-scope.md`。
- 认证、API、MCP tools、错误码和导出契约维护在 `docs/api-contract.md`。
- `docs/tvcmall-customer-mcp-v0.1-implementation.md` 只作为历史实施资料索引，不再维护长篇重复内容。
- 不要把临时计划、长篇会议记录或一次性分析塞回 `AGENTS.md`。
