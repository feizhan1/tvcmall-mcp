# TVCMall MCP 工具路由描述设计

## 目标

优化 MCP `tools/list` 中各 TVCMall 工具的中文 `description`，使 AI 能更准确地根据用户意图选择正确的只读工具。

## 范围

- 只修改 `src/app/register-tools.ts` 中 `server.registerTool()` 的 `description` 元数据。
- 保持工具名称、`title`、输入输出 schema、WebApi route、鉴权和实际执行行为不变。
- 更新单元测试，覆盖描述中的关键分流约束。

## 描述规范

每个描述按以下顺序表达：

1. 用“用于”说明适用任务和对象。
2. 仅在有助于选工具时说明必需标识符或筛选条件。
3. 对相近工具补充明确、可执行的分流规则。

描述避免罗列输出字段、内部 route、scope 或实现细节，避免掩盖路由信号。

## 关键路由规则

- `tvcmall_auth_status` 仅检查当前 session 是否已配置 PAT，不验证 PAT 是否有效。
- `tvcmall_search_products` 用于按关键词查找商品；已知 `product_id` 时使用 `tvcmall_get_product_detail`。
- `tvcmall_estimate_shipping` 仅用于未下单商品的运费预估，需 `sku`、`quantity` 和 `countrycode`；已有订单的物流或运费一律使用 `tvcmall_get_tracking_info`。
- `tvcmall_get_order_detail` 用于订单商品、金额和已脱敏收货信息；订单物流和运费使用 `tvcmall_get_tracking_info`。
- `tvcmall_get_tracking_info` 处理单个订单的物流轨迹和订单运费；多个订单才使用 `tvcmall_batch_get_tracking`。

## 测试

单元测试从 MCP Server 的已注册工具元数据读取 `description`，断言上述认证语义和各分流规则存在；同时保留只读能力描述的断言。

## 非目标

- 不增加、删除或重命名 MCP 工具。
- 不改变 MCP Client 展示方式或模型本身的工具选择逻辑。
- 不修改 API 契约、权限、日志或 WebApi 调用行为。
