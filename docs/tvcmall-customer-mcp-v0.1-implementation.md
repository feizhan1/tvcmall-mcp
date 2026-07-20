# TVCMall Customer MCP v0.1 实施资料索引

原始长篇实施资料已拆分为更稳定的项目文档，后续以以下文件为准：

- `README.md`：项目入口、远程部署、MCP Client URL + PAT 配置、安全原则和技术栈。
- `docs/mvp-scope.md`：项目定位、MVP 范围、总体架构、实施阶段、验收标准和主要风险。
- `docs/api-contract.md`：PAT header、session、现有 WebApi routes、只读 MCP tools、scope/allowlist 和错误码。
- `docs/remote-streamable-http-mcp-architecture.md`：远程部署拓扑、信任边界、PAT 透传授权链和数据流。
- `AGENTS.md`：AI Agent 在本仓库工作的稳定规则。

## 维护规则

- 产品范围、实施阶段、验收标准和风险更新到 `docs/mvp-scope.md`。
- PAT header、session、WebApi routes、MCP tools、scope/allowlist 和错误码更新到 `docs/api-contract.md`。
- 客户远程 MCP URL、PAT 配置、部署和项目入口信息更新到 `README.md`。
- 部署拓扑、信任边界、技术架构图和数据流转图更新到 `docs/remote-streamable-http-mcp-architecture.md`。
- 不再在本文件维护长篇重复内容，避免多份文档漂移。

## 参考资料

- [TVCMall Open API 文档](https://tvcmall.apifox.cn/)
- [TVCMall API 介绍文章](https://www.tvcmall.com/blog/inside-tvcmall/how-tvcmall-api-improves-e-commerce-efficiency-product-order-shipping-integration-guide.html)
- [Model Context Protocol SDK 文档](https://modelcontextprotocol.io/docs/sdk)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
