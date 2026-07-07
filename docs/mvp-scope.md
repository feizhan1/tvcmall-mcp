# TVCMall Customer MCP v0.1 MVP 范围

本文定义 TVCMall Customer MCP v0.1 的项目定位、能力范围、架构边界、实施阶段、验收标准和主要风险。

## 1. 项目定位

- 项目名称：`TVCMall Customer MCP`
- 用户对象：TVCMall 客户、采购商、分销商、店铺运营人员
- 使用方式：客户本地安装 MCP，通过 Claude / Cursor / Codex / 其他 MCP Client 使用
- 第一版性质：客户侧本地 MCP，默认只读

## 2. 核心场景

- A：选品 / 找货
- C：订单查询 / 物流跟踪 / 订单导出

示例问题：

```text
帮我查找 TVCMall 上适合 iPhone 的手机壳
查询我最近 10 个订单
导出上个月已发货订单
批量查询这些订单的物流状态
```

## 3. 已确定方案

```text
分发方式：npm / npx 本地安装
运行方式：stdio MCP server
登录方式：独立 CLI 交互登录
授权方式：用户名 + 密码换取 access_token / refresh_token
凭证保存：本地保存 token，不保存密码
后端支持：TVCMall 新增 MCP 专用登录授权接口
首批能力：商品查询 + 订单查询 + 物流查询 + 本地订单导出
```

推荐客户体验：

```bash
npx @tvcmall/mcp login
npx @tvcmall/mcp install claude
```

## 4. 总体架构

```text
客户电脑
┌──────────────────────────────┐
│ Claude / Cursor / Codex       │
│ MCP Client                    │
└───────────────┬──────────────┘
                │ stdio / JSON-RPC
┌───────────────▼──────────────┐
│ @tvcmall/mcp 本地 MCP Server  │
│ - 注册 MCP tools              │
│ - 读取本地 token              │
│ - 调用 TVCMall MCP API        │
│ - 本地生成导出文件            │
└───────────────┬──────────────┘
                │ HTTPS + Bearer token
┌───────────────▼──────────────┐
│ TVCMall MCP API / Gateway     │
│ - 登录授权                    │
│ - token refresh               │
│ - 权限校验                    │
│ - 商品 / 订单 / 物流 API      │
│ - 审计 / 限流 / 风控           │
└───────────────┬──────────────┘
                │ 内部服务或现有 Open API
┌───────────────▼──────────────┐
│ TVCMall 核心业务系统          │
└──────────────────────────────┘
```

## 5. v0.1 能力范围

### 包含

- `tvcmall_auth_status`：检查当前登录状态。
- `tvcmall_search_products`：搜索商品。
- `tvcmall_get_product_detail`：查看商品详情。
- `tvcmall_estimate_shipping`：估算运费。
- `tvcmall_list_orders`：查询订单列表。
- `tvcmall_get_order_detail`：查询订单详情。
- `tvcmall_get_tracking_info`：查询单个订单物流。
- `tvcmall_batch_get_tracking`：批量查询物流。
- `tvcmall_export_orders`：导出订单到本地文件。

### 不包含

- `orders:create`
- `orders:update`
- `orders:cancel`
- `payment:create`
- `address:update`

第一版不要做下单、支付、改地址、取消订单等写操作。

## 6. 订单导出范围

- 导出生成本地文件，不在 AI 对话中输出完整订单表。
- 默认目录：`~/Downloads/tvcmall-exports/`
- v0.1 优先支持 `xlsx`，可以同时支持 `csv`。
- 默认最多导出 90 天。
- 大批量导出必须分页拉取。
- 导出前后端都要校验 `orders:export` 权限。
- MCP 对话里只返回文件路径和摘要。
- 电话、邮箱、地址是否脱敏由后端权限控制。
- 文件名带时间戳，避免覆盖。

文件名示例：

```text
tvcmall-orders-20260707-153000.xlsx
tvcmall-orders-20260707-153000.csv
```

## 7. 实施阶段

### 阶段 0：接口盘点和契约确认

- 确认 TVCMall 现有商品、订单、物流、运费 API 能力。
- 确认 MCP 专用登录接口字段。
- 确认 token、scope、过期时间、撤销机制。
- 输出 OpenAPI / Apifox 文档。

### 阶段 1：后端 MCP Auth

- 实现 `/api/mcp/auth/login`。
- 实现 `/api/mcp/auth/refresh`。
- 实现 `/api/mcp/auth/logout`。
- 实现 `/api/mcp/auth/me`。
- 增加设备记录、审计日志、限流。

### 阶段 2：本地 MCP 骨架

- 初始化 npm 包。
- 实现 `server` stdio MCP。
- 实现 `login/logout/whoami`。
- 实现 token 存储和自动 refresh。
- 实现统一 HTTP client 和错误处理。

### 阶段 3：商品工具

- 实现 `tvcmall_search_products`。
- 实现 `tvcmall_get_product_detail`。
- 实现 `tvcmall_estimate_shipping`。
- 做分页、超时、重试和返回摘要。

### 阶段 4：订单和物流工具

- 实现 `tvcmall_list_orders`。
- 实现 `tvcmall_get_order_detail`。
- 实现 `tvcmall_get_tracking_info`。
- 实现 `tvcmall_batch_get_tracking`。
- 加权限校验和 PII 脱敏策略。

### 阶段 5：订单导出

- 实现 `tvcmall_export_orders`。
- 支持 `xlsx` / `csv`。
- 默认写入 `~/Downloads/tvcmall-exports/`。
- 返回文件路径和摘要。
- 加导出数量、时间范围、权限限制。

### 阶段 6：安装和发布

- 实现 `install claude/cursor/codex`。
- 完善 README 和客户安装文档。
- 发布 npm 包。
- 内部测试后灰度给客户。

## 8. 验收标准

MVP 完成标准：

- 客户能通过 `npx @tvcmall/mcp login` 登录。
- MCP Client 能成功启动 `@tvcmall/mcp server`。
- 未登录时 tools 返回明确引导。
- access token 过期后可自动 refresh。
- 可搜索商品、查看商品详情、估算运费。
- 可查询订单列表、订单详情、物流信息。
- 可批量查询物流。
- 可导出订单到本地 `xlsx` / `csv` 文件。
- 不保存明文密码。
- 不在 AI 对话里暴露 token。
- stdout 只输出 MCP 协议内容，日志走 stderr 或日志文件。
- 后端有审计、限流、权限控制。

## 9. 主要风险

- **密码安全风险**：必须通过独立 CLI 隐藏输入，不允许 MCP tool 接收密码。
- **stdio 协议污染**：server 模式不能打印普通日志到 stdout。
- **PII 泄露风险**：订单详情、地址、电话、导出文件都需要权限和脱敏策略。
- **客户安装门槛**：npm/npx 方案要求客户本地有 Node.js，需要安装文档或安装助手。
- **不同 MCP Client 配置差异**：Claude、Cursor、Codex 的配置路径和格式可能不同，需要分别适配。
- **现有 Open API 能力不完整**：如果现有 API 不覆盖订单物流或权限隔离，需要后端补 MCP Gateway。

## 10. 建议立即开始的事项

1. 后端先定义 MCP Auth API 契约，尤其是 token、scope、refresh、logout。
2. 工具侧先做 `@tvcmall/mcp` 空壳，跑通 stdio MCP + `auth_status`。
3. 并行确认商品、订单、物流、运费接口是否能用 Bearer token 调用。
4. 先内部发布 npm beta，找 1-2 个测试账号跑完整链路。
5. 最后再做 `install claude/cursor/codex` 的自动配置命令。
