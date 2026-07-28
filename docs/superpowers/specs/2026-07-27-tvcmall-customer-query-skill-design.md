# TVCMall 客户查询 Skill 设计

## 目标

为已经实现的 TVCMall Customer MCP 增加仓库级 Codex Skill，使模型能把商品、未下单商品运费、订单、物流、积分和余额问题稳定路由到正确的只读 MCP tool，并按安全、脱敏的格式回答。

Skill 只负责意图识别、跨 tool 编排、缺失参数追问、错误解释和结果呈现。MCP Server 继续负责认证上下文、输入 schema、WebApi 调用、权限边界、错误映射和输出脱敏。

## 交付形态

在仓库根目录新增：

```text
.agents/skills/query-tvcmall-customer-data/
  SKILL.md
  agents/
    openai.yaml
```

选择仓库级 `.agents/skills`，便于团队共同维护并让从本仓库启动的 Codex 自动发现。当前版本为 instruction-only Skill，不增加脚本、资产或重复的 API 参考文件。

## 触发范围

Skill 名称为 `query-tvcmall-customer-data`。其描述覆盖以下用户意图：

- 按 SKU 或关键词搜索商品并查看详情；
- 估算未下单商品运费；
- 查询订单列表、订单详情、物流轨迹和订单运费；
- 查询积分汇总、积分流水和余额流水。

描述同时明确只读边界。下单、支付、取消订单、修改地址、积分兑换和文件导出不属于触发后的可执行能力。

## 工作流设计

### 通用原则

1. 仅使用 MCP tool 返回值作为业务事实，不直接调用 TVCMall WebApi，也不猜测缺失数据。
2. 不要求用户在对话中粘贴 PAT、`TVCMALL_API_KEY` 或 `Authorization`；认证信息必须由 MCP Client 的 secret 配置提供。
3. `tvcmall_auth_status.configured=true` 只解释为当前 session 已配置 PAT，不解释为凭据已验证、未过期或拥有 scope。
4. 不恢复或推断后端已脱敏的 PII，不输出原始 WebApi 响应。
5. 只追问执行当前 tool 所缺少的必填参数，不扩大查询范围或无限翻页。

### Tool 路由

| 用户意图 | Tool | 关键约束 |
| --- | --- | --- |
| 按 SKU 或关键词查商品 | `tvcmall_search_products` | 多项结果先让用户按标题或 SKU 确认 |
| 查看唯一商品详情 | `tvcmall_get_product_detail` | `product_id` 必须原样来自搜索结果 |
| 估算未下单商品运费 | `tvcmall_estimate_shipping` | 要求 SKU、数量和两位国家代码 |
| 查找或筛选订单 | `tvcmall_list_orders` | 使用受支持的状态枚举和有限分页 |
| 查看订单商品、金额或收货信息 | `tvcmall_get_order_detail` | 已知 `order_id` 时使用 |
| 查看单个订单物流或订单运费 | `tvcmall_get_tracking_info` | 已下单运费不得使用商品运费试算 |
| 查看多个订单物流 | `tvcmall_batch_get_tracking` | 一次最多 50 个订单号 |
| 查看积分汇总 | `tvcmall_get_points` | 与积分流水、余额流水区分 |
| 查看积分流水 | `tvcmall_list_point_records` | `direction` 使用 `all`、`got` 或 `used` |
| 查看余额流水 | `tvcmall_list_balance_records` | `direction` 使用 `all`、`income` 或 `expense` |

自然语言订单状态映射为现有枚举：全部 `V3All`、待付款 `V3Unpaid`、待确认 `V3AwaitingConfirmation`、备货中 `V3Preparing`、已发货 `V3Shipped`、已完成 `V3Done`。

### 多 Tool 编排

Skill 支持组合只读流程，但不在服务端保存额外状态。例如“查询最近已发货订单的物流”先调用 `tvcmall_list_orders(status=V3Shipped)`，再把当前结果中的订单号传给 `tvcmall_batch_get_tracking`，最后汇总订单和最新物流状态。

商品详情流程必须遵守唯一性：搜索无结果时停止；只有一个结果时可在用户需要详情的前提下继续；多个结果时必须先让用户确认，不能自行选择。

## 错误处理

- `AUTH_REQUIRED`：提示在 MCP Client 中配置或更新 PAT，不要求用户在对话中发送凭据。
- `PERMISSION_DENIED`：说明当前 PAT 缺少权限或后端 route allowlist 未开放，不建议绕过。
- `RATE_LIMITED`：说明请求受到限流并建议稍后重试。
- `API_UNAVAILABLE`：说明服务暂时不可用，不编造结果。
- `PRODUCT_NOT_FOUND`：说明未找到商品并建议重新提供 SKU 或关键词。

## 输出要求

回答先给用户直接结论，再提供必要的结构化摘要。商品结果优先展示标题、SKU、价格和必要摘要；订单结果展示订单号、状态、金额和日期；物流结果展示当前状态、承运商、运单号和最新轨迹。不同币种不得直接相加。

输出不得包含 PAT、认证 header、未经控制的上游正文或不必要的 PII。

## MCP 依赖元数据

`agents/openai.yaml` 提供 `display_name`、`short_description` 和显式包含 `$query-tvcmall-customer-data` 的 `default_prompt`，并声明标识为 `tvcmall` 的 Streamable HTTP MCP 依赖。

生产 MCP URL 尚未在仓库中确定，因此 Skill 不写入虚构 URL，也不写入任何 PAT。实际 URL 和 `TVCMALL_API_KEY` header 继续由 MCP Client 配置；Skill 不能替代客户端认证配置。

## 测试与验收

采用 Skill 的 RED-GREEN-REFACTOR 验证：

1. 在 Skill 创建前，以代表性查询记录模型基线行为，重点观察商品多结果、已下单运费、积分与余额、认证失败等路由。
2. 创建 Skill 后复用相同场景，确认模型遵守 tool 路由、安全边界和错误解释。
3. 使用 `skill-creator` 的 `quick_validate.py` 校验目录名、YAML frontmatter 和必填字段。
4. 检查 `agents/openai.yaml` 与 `SKILL.md` 一致，且不包含真实 URL、PAT、`TVCMALL_API_KEY` 值、`Authorization` 或客户 PII。
5. 运行 `git diff --check`，确认文档格式无误。

代表性验收场景包括：

- 商品搜索多项结果时先让用户确认，不直接调用详情；
- 商品搜索唯一结果时使用返回的 `product_id` 查询详情；
- 已知订单号询问运费时选择物流 tool；
- 最近已发货订单物流使用订单列表加批量物流；
- 积分汇总、积分流水和余额流水选择各自 tool；
- 缺失或无效认证时不要求用户在对话中粘贴 PAT。

## 非目标

- 不修改 MCP tool、WebApi route、scope、allowlist、认证或 session 行为。
- 不增加写操作、导出能力或独立认证流程。
- 不把生产 MCP URL、PAT 或客户数据提交到仓库。
- 不为其他 AI 客户端提供专用安装包；跨产品分发后续通过 Plugin 单独设计。
