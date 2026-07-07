# TVCMall Customer MCP v0.1 实施资料索引

原始长篇实施资料已拆分为更稳定的项目文档，后续以以下文件为准：

- `README.md`：项目入口、当前状态、文档地图、客户使用方式、安全原则、技术栈和下一步。
- `docs/mvp-scope.md`：项目定位、MVP 范围、总体架构、实施阶段、验收标准和主要风险。
- `docs/api-contract.md`：CLI、认证接口、token 策略、凭证存储、MCP tools、后端 API、scope、错误码和订单导出契约。
- `AGENTS.md`：AI Agent 在本仓库工作的稳定规则。

## 维护规则

- 产品范围、实施阶段、验收标准和风险更新到 `docs/mvp-scope.md`。
- 认证、API、MCP tools、错误码、导出规则更新到 `docs/api-contract.md`。
- 客户安装、使用说明和项目入口信息更新到 `README.md`。
- 不再在本文件维护长篇重复内容，避免多份文档漂移。

## 参考资料

- [TVCMall Open API 文档](https://tvcmall.apifox.cn/)
- [TVCMall API 介绍文章](https://www.tvcmall.com/blog/inside-tvcmall/how-tvcmall-api-improves-e-commerce-efficiency-product-order-shipping-integration-guide.html)
- [Model Context Protocol SDK 文档](https://modelcontextprotocol.io/docs/sdk)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
