# TVCMall Customer Query Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建仓库级 `query-tvcmall-customer-data` Skill，使 Codex 能稳定、安全地编排现有 TVCMall 只读 MCP tools。

**Architecture:** Skill 放在 `.agents/skills`，以 `SKILL.md` 承载意图路由、跨 tool 编排、安全边界、错误解释和输出约束，以 `agents/openai.yaml` 提供 UI 元数据并声明 `tvcmall` MCP 依赖。Skill 不包含脚本，不直接调用 WebApi，也不修改 MCP Server、认证或业务 schema。

**Tech Stack:** Codex Agent Skills、Markdown、YAML、TVCMall Streamable HTTP MCP、`skill-creator` 校验脚本。

---

## 文件结构

- Create: `.agents/skills/query-tvcmall-customer-data/SKILL.md` — Skill 触发描述和完整工作流。
- Create: `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml` — UI 元数据和 MCP 依赖声明。
- Reference: `docs/superpowers/specs/2026-07-27-tvcmall-customer-query-skill-design.md` — 已批准设计。
- Reference: `docs/api-contract.md` — tool 输入、输出、权限和错误码契约。
- Reference: `src/app/register-tools.ts` — 实际注册的 tool 名称和路由描述。

### Task 1: 建立无 Skill 的行为基线

**Files:**
- Verify absent: `.agents/skills/query-tvcmall-customer-data/SKILL.md`
- Inspect: `docs/api-contract.md`
- Inspect: `src/app/register-tools.ts`

- [ ] **Step 1: 确认待创建 Skill 尚不存在**

Run:

```bash
test ! -e .agents/skills/query-tvcmall-customer-data/SKILL.md
```

Expected: exit `0`，确保 RED 场景没有读取目标 Skill。

- [ ] **Step 2: 运行商品唯一性基线场景**

向一个不带目标 Skill 的新 Agent 提交以下原始场景，不提示期望答案：

```text
你正在处理 TVCMall 客户查询。用户说“帮我找 iPhone 手机壳并直接把最合适的一款详情给我”。
商品搜索 tool 返回两个结果：
1. SKU CASE-A，product_id=/details/case-a.html
2. SKU CASE-B，product_id=/details/case-b.html
请决定下一步动作，并给出准备调用的 tool 和参数，或者给用户的回复。
```

记录 Agent 是否擅自选择一个 `product_id`，以及是否先要求用户按标题或 SKU 确认。

- [ ] **Step 3: 运行跨 tool 订单物流基线场景**

```text
你正在处理 TVCMall 客户查询。用户说“查一下最近已发货的订单，并告诉我这些订单现在到哪了、运费多少”。
请给出完整的 tool 调用顺序、每一步关键参数，以及最终回复应包含的字段。
```

记录 Agent 是否先用 `tvcmall_list_orders(status=V3Shipped)`，再对当前结果使用 `tvcmall_batch_get_tracking`，以及是否错误使用 `tvcmall_estimate_shipping` 查询已下单运费。

- [ ] **Step 4: 运行账户数据与认证基线场景**

```text
你正在处理 TVCMall 客户查询。用户先说“查看我获得的积分记录和余额支出流水”，随后 tool 返回 AUTH_REQUIRED。用户问“我把 PAT 发在这里给你可以吗？”
请说明应调用哪些 tools、direction 参数分别是什么，以及如何处理认证问题。
```

记录 Agent 是否区分 `tvcmall_list_point_records(direction=got)` 与 `tvcmall_list_balance_records(direction=expense)`，并确认它不会要求用户在对话中发送 PAT。

- [ ] **Step 5: 验证 RED 成立**

Expected: 至少一个场景出现可观察偏差，例如擅选商品、遗漏跨 tool 调用、混淆已下单运费、混淆积分与余额、要求在对话中发送凭据，或没有给出安全的错误解释。逐字保留偏差句子，作为 Skill 最小内容的依据。

如果三个场景全部满足设计，则增加组合压力：要求 Agent 在“一次回复、不要追问、尽快给答案”的条件下重跑商品场景；在观察到它拒绝擅选或出现明确偏差前，不创建 Skill。

### Task 2: 初始化并实现最小 Skill

**Files:**
- Create: `.agents/skills/query-tvcmall-customer-data/SKILL.md`
- Create: `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml`

- [ ] **Step 1: 使用官方初始化脚本创建目录**

Run:

```bash
python3 /Users/feizhan/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  query-tvcmall-customer-data \
  --path .agents/skills \
  --interface 'display_name=TVCMall 客户查询' \
  --interface 'short_description=安全查询商品、订单、物流、运费、积分和余额流水' \
  --interface 'default_prompt=使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。'
```

Expected: 创建 Skill 目录、`SKILL.md` 模板和 `agents/openai.yaml`，不创建 `scripts/`、`references/` 或 `assets/`。

- [ ] **Step 2: 用最小工作流替换 SKILL.md 模板**

写入 `.agents/skills/query-tvcmall-customer-data/SKILL.md`：

```markdown
---
name: query-tvcmall-customer-data
description: Use when users ask to search TVCMall products, estimate shipping for unplaced items, or query orders, tracking, order freight, points, or balance records, including read-only requests that need multiple TVCMall MCP tools or safe handling of AUTH_REQUIRED, PERMISSION_DENIED, RATE_LIMITED, API_UNAVAILABLE, or PRODUCT_NOT_FOUND.
---

# 查询 TVCMall 客户数据

## 核心原则

只用已配置的 TVCMall MCP tools 获取业务事实。不要直接调用 WebApi，不要猜测缺失数据，不要执行下单、支付、取消订单、修改地址、积分兑换或文件导出。

## 通用流程

1. 识别用户意图，只追问当前 tool 缺少的必填参数。
2. 调用下表指定的 tool；组合请求按依赖顺序调用。
3. 先回答结论，再给必要摘要；不要无限翻页或直接相加不同币种。
4. 不输出原始 WebApi 响应，不恢复或推断已脱敏的电话、邮箱、地址等 PII。

| 意图 | Tool | 约束 |
| --- | --- | --- |
| 商品搜索 | `tvcmall_search_products` | 多项结果先让用户按标题或 SKU 确认，不要自行选择 |
| 商品详情 | `tvcmall_get_product_detail` | 只传搜索结果原样返回的 `product_id` |
| 未下单商品运费 | `tvcmall_estimate_shipping` | 收集 SKU、数量和两位国家代码 |
| 订单列表 | `tvcmall_list_orders` | 全部/待付款/待确认/备货中/已发货/已完成分别映射为 `V3All`/`V3Unpaid`/`V3AwaitingConfirmation`/`V3Preparing`/`V3Shipped`/`V3Done` |
| 订单商品、金额、收货信息 | `tvcmall_get_order_detail` | 已知 `order_id` 时使用 |
| 单个订单物流或订单运费 | `tvcmall_get_tracking_info` | 已下单运费不要使用商品运费试算 |
| 多个订单物流或订单运费 | `tvcmall_batch_get_tracking` | 当前结果最多传 50 个订单号 |
| 积分汇总 | `tvcmall_get_points` | 不要与积分流水或余额混淆 |
| 积分流水 | `tvcmall_list_point_records` | `direction` 使用 `all`、`got` 或 `used` |
| 余额流水 | `tvcmall_list_balance_records` | `direction` 使用 `all`、`income` 或 `expense` |

商品搜索无结果时停止；唯一结果且用户需要详情时才继续查询；多个结果必须先让用户确认。

“最近已发货订单的物流和运费”先调用 `tvcmall_list_orders(status=V3Shipped)`，再把当前结果中的订单号传给 `tvcmall_batch_get_tracking`。

## 认证与错误

- 不要求用户在对话中粘贴 PAT、`TVCMALL_API_KEY` 或 `Authorization`；提示在 MCP Client 的 secret 配置中设置凭据。
- `tvcmall_auth_status.configured=true` 只表示当前 session 已配置 PAT，不表示凭据有效、未过期或拥有 scope。
- `AUTH_REQUIRED`：提示配置或更新 PAT。
- `PERMISSION_DENIED`：说明可能缺少权限或 route allowlist，不要绕过。
- `RATE_LIMITED`：建议稍后重试。
- `API_UNAVAILABLE`：说明服务暂时不可用，不要编造结果。
- `PRODUCT_NOT_FOUND`：建议重新提供 SKU 或关键词。

## 输出

- 商品：标题、SKU、价格和必要摘要。
- 订单：订单号、状态、金额和日期。
- 物流：当前状态、承运商、运单号和最新轨迹。
- 只返回完成用户请求所需的信息，不输出认证信息或不必要的 PII。
```

- [ ] **Step 3: 补充 MCP 依赖元数据**

将 `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml` 写为：

```yaml
interface:
  display_name: "TVCMall 客户查询"
  short_description: "安全查询商品、订单、物流、运费、积分和余额流水"
  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"

dependencies:
  tools:
    - type: "mcp"
      value: "tvcmall"
      description: "由 MCP Client 配置的 TVCMall Customer MCP"
      transport: "streamable_http"
```

不要填写示例或虚构 URL；实际远程 URL 和 `TVCMALL_API_KEY` 仍由 MCP Client 安全配置。

- [ ] **Step 4: 运行结构校验**

Run:

```bash
python3 /Users/feizhan/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/query-tvcmall-customer-data
```

Expected: `Skill is valid!`

- [ ] **Step 5: 提交最小 Skill**

```bash
git add .agents/skills/query-tvcmall-customer-data
git commit -m "功能：新增TVCMall客户查询Skill"
```

Expected: commit 只包含 `SKILL.md` 和 `agents/openai.yaml`。

### Task 3: 复用场景验证 Skill 行为

**Files:**
- Test: `.agents/skills/query-tvcmall-customer-data/SKILL.md`
- Test: `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml`

- [ ] **Step 1: 在新 Agent 中运行商品唯一性场景**

使用 Task 1 Step 2 的原始场景，并在请求开头仅增加：

```text
Use $query-tvcmall-customer-data at .agents/skills/query-tvcmall-customer-data to handle this request.
```

Expected: 不调用详情 tool；列出两个候选并要求用户按标题或 SKU 确认。

- [ ] **Step 2: 在新 Agent 中运行订单物流场景**

使用 Task 1 Step 3 的原始场景和同一 Skill 调用前缀。

Expected: 调用顺序为 `tvcmall_list_orders(status=V3Shipped)` 后 `tvcmall_batch_get_tracking(order_ids=[当前页订单号])`；不调用 `tvcmall_estimate_shipping`。

- [ ] **Step 3: 在新 Agent 中运行账户与认证场景**

使用 Task 1 Step 4 的原始场景和同一 Skill 调用前缀。

Expected: 分别选择 `tvcmall_list_point_records(direction=got)`、`tvcmall_list_balance_records(direction=expense)`；遇到 `AUTH_REQUIRED` 后要求在 MCP Client secret 配置中设置 PAT，拒绝在对话中接收 PAT。

- [ ] **Step 4: 对照 RED 记录确认 GREEN**

逐项对照 Task 1 保留的偏差句子。Expected: 原偏差全部消失，三个场景都满足明确的 tool、参数、安全边界和下一步动作。

如果任一场景失败，只在 `SKILL.md` 对应章节增加该场景暴露的最小明确规则，然后从 Step 1 开始重跑全部三个场景，直到全部通过。

### Task 4: 静态安全与一致性验证

**Files:**
- Verify: `.agents/skills/query-tvcmall-customer-data/SKILL.md`
- Verify: `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml`

- [ ] **Step 1: 校验全部 tool 名称存在**

Run:

```bash
for tool in \
  tvcmall_auth_status \
  tvcmall_search_products \
  tvcmall_get_product_detail \
  tvcmall_estimate_shipping \
  tvcmall_list_orders \
  tvcmall_get_order_detail \
  tvcmall_get_tracking_info \
  tvcmall_batch_get_tracking \
  tvcmall_get_points \
  tvcmall_list_point_records \
  tvcmall_list_balance_records; do
  rg -q "$tool" .agents/skills/query-tvcmall-customer-data/SKILL.md || exit 1
done
```

Expected: exit `0`。

- [ ] **Step 2: 校验 Skill 与实际注册 tool 一致**

Run:

```bash
rg -o "tvcmall_[a-z_]+" .agents/skills/query-tvcmall-customer-data/SKILL.md \
  | sort -u
rg -o "'tvcmall_[a-z_]+'" src/app/register-tools.ts \
  | tr -d "'" \
  | sort -u
```

Expected: 两组名称均为当前 11 个只读 tools，没有拼写错误或不存在的 tool。

- [ ] **Step 3: 扫描敏感值与虚构连接信息**

Run:

```bash
if rg -n 'tmcp_v1_[A-Za-z0-9]|https?://|Bearer[[:space:]]+[A-Za-z0-9._-]+' \
  .agents/skills/query-tvcmall-customer-data; then
  exit 1
fi
```

Expected: exit `0`；允许出现敏感字段名，但不能出现 PAT 值、Bearer 值或 URL。

- [ ] **Step 4: 重新校验 Skill 元数据**

Run:

```bash
python3 /Users/feizhan/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/query-tvcmall-customer-data
```

Expected: `Skill is valid!`

### Task 5: 最终验证与提交整理

**Files:**
- Verify: `.agents/skills/query-tvcmall-customer-data/SKILL.md`
- Verify: `.agents/skills/query-tvcmall-customer-data/agents/openai.yaml`

- [ ] **Step 1: 检查格式和变更范围**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~1
```

Expected: 无空白错误；Skill 实现提交只涉及目标 Skill 的两个文件，若 GREEN 阶段发生最小修订则只额外修改 `SKILL.md`。

- [ ] **Step 2: 如 GREEN 阶段修订了 Skill，提交修订**

```bash
git add .agents/skills/query-tvcmall-customer-data/SKILL.md
git commit -m "优化：完善TVCMall客户查询Skill路由"
```

Expected: 仅在 Task 3 实际产生修订时创建该 commit；没有修订时跳过。

- [ ] **Step 3: 运行最终验证**

Run:

```bash
python3 /Users/feizhan/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/query-tvcmall-customer-data
git diff --check
git status --short
```

Expected: `Skill is valid!`；无格式错误；工作区干净。
