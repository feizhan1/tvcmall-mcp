# 移除订单导出能力设计

## 目标

从 TVCMall Customer MCP 中完整移除订单导出能力。移除后，远程 MCP 仅保留商品、运费估算、积分、订单查询和物流查询等只读查询工具。

## 范围

删除以下内容：

- MCP tool `tvcmall_export_orders`，包括输入、输出、注册说明和权限校验。
- CSV 或其他订单文件导出器、服务端临时导出存储及导出文件 TTL 清理逻辑。
- 远程 HTTP 的 `GET /exports/:exportId` 下载端点及导出文件归属校验。
- `TVCMALL_EXPORT_DIR`、`TVCMALL_EXPORT_TTL_MS` 等仅用于导出的运行时配置。
- 与导出有关的单元测试、集成测试、fixtures 和测试辅助代码。
- README、MVP 范围、API 契约、harness 说明及架构文档中的订单导出能力、下载流程、示例、验收项与风险说明。

不改变以下能力：

- MCP Client 在每个 `/mcp` 请求携带 PAT，并由 session 绑定 PAT 的 SHA-256 指纹。
- MCP 使用同一 PAT 调用现有 TVCMall WebApi route，由 WebApi → ApplicationServices → RDS 完成 verifier、scope 和 route allowlist 授权。
- Streamable HTTP MCP session、商品、积分、运费、订单和物流查询。
- 订单详情中后端按权限返回的脱敏信息。

## 架构调整

移除 Export Store 和下载端点后，远程服务只保留 `/mcp` 和 `/healthz` 公开端点。MCP tools 直接调用业务查询 API，并将 AI 友好摘要返回给客户端；不会生成或持久化订单文件。

```text
MCP Client -- Bearer PAT --> /mcp --> MCP Tools -- same PAT --> TVCMall WebApi
                              |                                  |
                              +--> /healthz                      +--> ApplicationServices --> RDS
```

`orders:export` 不再是 MCP 所需 scope。若后端保留该 scope 以服务其他产品，它不属于本 MCP 服务的权限模型。

## 安全影响

移除导出能力可减少订单 PII 以文件形式暂存、下载链接泄露、文件 TTL 清理失败和跨 customer 文件访问等风险。查询工具仍必须依赖 WebApi 后端权限和脱敏策略；PAT 原文只存在于当前 MCP session 的内存认证上下文，并且不得进入日志、错误、tool 输出或持久层。

## 测试与验收

完成后必须满足：

1. `tools/list` 中不再包含 `tvcmall_export_orders`。
2. 不存在 `/exports/:exportId` 路由、导出 store、CSV exporter 或导出目录/TTL 配置。
3. API 文档和架构图不再描述导出、下载 URL、文件路径或 `orders:export`。
4. 商品、订单、积分、运费和物流测试继续通过。
5. 运行 `npm test`、`npm run typecheck` 和 `npm run build` 验证删除没有留下引用。
