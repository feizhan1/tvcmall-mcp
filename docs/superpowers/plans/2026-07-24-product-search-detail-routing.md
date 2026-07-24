# 商品搜索与详情路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让商品搜索结果提供可直接传给详情工具的 WebApi `Url`，并让模型按唯一性正确路由两项工具。

**Architecture:** `ProductSummary` 新增 `product_id`，该字段只承载 WebApi 商品对象的 `Url`。搜索 HTTP client 显式以 `data.Products` 为权威列表；详情输入 schema 仅接收 `/details/` 路径，工具描述和搜索摘要共同引导模型先搜索、再按唯一性选择详情调用。

**Tech Stack:** Node.js 20、TypeScript、Zod、Vitest、MCP SDK。

---

### Task 1: 为详情路径与搜索结果建立失败回归测试

**Files:**
- Modify: `tests/unit/http-product-client.test.ts`
- Modify: `tests/unit/search-products-tool.test.ts`
- Modify: `tests/unit/product-detail-tool.test.ts`
- Modify: `tests/unit/server.test.ts`

- [ ] **Step 1: 为 WebApi `data.Products[].Url` 编写失败测试**

在 `tests/unit/http-product-client.test.ts` 的真实搜索响应样例断言中加入：

```ts
expect(result.items[0]).toMatchObject({
  product_id: '/details/dux-ducis-for-iphone-17-pro-case-magnetic-frosted-shockproof-2-in-1-pc-tpu-magsafe-cover-red-sku661100446a.html'
});
```

新增一个含 `data.Products` 与干扰 `list` 的响应，断言只映射 `Products` 中的 SKU 和 URL：

```ts
expect(result.items).toMatchObject([
  { sku: 'SKU-FROM-PRODUCTS', product_id: '/details/from-products.html' }
]);
```

- [ ] **Step 2: 运行 HTTP client 测试确认失败**

Run: `npm test -- tests/unit/http-product-client.test.ts`

Expected: FAIL，因为当前 `ProductSummary` 没有 `product_id`，且搜索实现尚未明确优先读取 `data.Products`。

- [ ] **Step 3: 为 MCP 工具路由编写失败测试**

在 `tests/unit/search-products-tool.test.ts` 断言唯一 Fake 搜索结果有 `/details/` 开头的 `items[0].product_id`，并断言其文本摘要包含“唯一”。在 `tests/unit/product-detail-tool.test.ts` 改为将该详情路径传入 `getProductDetailForMcp()`，再为：

```ts
expect(() => GetProductDetailInputSchema.parse({ product_id: 'TVC-IP15-CASE-CLEAR' })).toThrow();
expect(() => GetProductDetailInputSchema.parse({ product_id: 'iphone case' })).toThrow();
```

添加 `/details/missing-product.html` 的 `PRODUCT_NOT_FOUND` 场景。更新 `tests/unit/server.test.ts` 的预期描述，要求搜索描述包含 SKU、关键词、唯一结果和 `product_id`，详情描述包含搜索结果、`Url`、SKU 和关键词禁止项。

- [ ] **Step 4: 运行工具路由测试确认失败**

Run: `npm test -- tests/unit/search-products-tool.test.ts tests/unit/product-detail-tool.test.ts tests/unit/server.test.ts`

Expected: FAIL，因为 Fake 商品没有详情路径、详情 schema 仍接受 SKU，且工具描述尚未包含新分流规则。

### Task 2: 实现搜索详情标识与详情路径校验

**Files:**
- Modify: `src/products/product-client.ts`
- Modify: `src/products/http-product-client.ts`
- Modify: `src/fixtures/products.ts`
- Modify: `src/products/fake-product-client.ts`
- Modify: `src/tools/products.ts`

- [ ] **Step 1: 扩展商品领域类型和受控 fixture**

在 `ProductSummary` 中加入：

```ts
product_id: string;
```

为 `src/fixtures/products.ts` 每一条 `FIXTURE_PRODUCT_DETAILS` 赋予唯一、以 `/details/` 开头的 `product_id`。在 `FakeProductClient.getProductDetail()` 中只按 `product.product_id === productId` 查找，避免 SKU 或内部 `id` 继续被当作详情标识接受。

- [ ] **Step 2: 映射权威 WebApi 商品列表与 URL**

在 `HttpProductClient.searchProducts()` 中，将 `payload.Products` 存在时作为唯一的商品数组来源；仅在该字段不存在时才沿用 `model`、`items`、`list` 等兼容回退。`mapProductSummary()` 新增：

```ts
product_id: readString(source, ['url']),
```

保留现有 `id` 从 SKU 或内部 ID 映射的逻辑。`mapProductDetail()` 复用该映射，使详情结构化输出也带回其 WebApi `Url`。

- [ ] **Step 3: 限制详情工具只能接收 WebApi 详情路径**

将 `GetProductDetailInputSchema` 的 `product_id` 替换为：

```ts
z.string()
  .trim()
  .regex(/^\/details\/[^?#]+$/, 'product_id 必须是商品搜索结果中的详情路径')
  .describe('必须传入 tvcmall_search_products 返回项的 product_id，即 WebApi Url')
```

`getProductDetailForMcp()` 继续将校验后的原值传给 `productClient.getProductDetail()`；HTTP client 因而继续把该值原样写入 `{ url: productId }`。

- [ ] **Step 4: 优化搜索摘要的唯一性提示**

在 `formatProductSearchSummary()` 中按 `result.items.length` 处理：空数组保留“未找到”；一项时明确“唯一匹配”并指向该项的 `product_id`；多项时明确“匹配不唯一”，要求按标题或 SKU 请用户确认。每个摘要行包含 SKU、价格、库存和 `product_id`，使模型无需猜测详情入参。

- [ ] **Step 5: 运行 Task 1 测试确认通过**

Run: `npm test -- tests/unit/http-product-client.test.ts tests/unit/search-products-tool.test.ts tests/unit/product-detail-tool.test.ts`

Expected: PASS，且搜索详情路径、`data.Products` 优先级、SKU 拒绝和 Fake 详情查询均被覆盖。

### Task 3: 发布面向模型的工具描述与文档契约

**Files:**
- Modify: `src/app/register-tools.ts`
- Modify: `tests/unit/server.test.ts`
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/mvp-scope.md`

- [ ] **Step 1: 更新两项 MCP 工具描述**

将搜索工具描述替换为表达下列规则的中文文本：支持 SKU 或关键词；返回项 `product_id` 来自 WebApi `Url`；仅 `items` 一项时可用其继续查询详情；多项时先让用户按标题或 SKU 确认。将详情工具描述替换为表达下列规则的中文文本：`product_id` 只能是搜索结果返回的 `Url`；不能传 SKU、关键词或内部 ID；未知商品先搜索。

- [ ] **Step 2: 同步项目文档**

在 `README.md` 和 `docs/mvp-scope.md` 的工具表中把搜索用途表述为“按 SKU 或关键词搜索并提供详情路径”，把详情用途表述为“使用搜索结果的 `product_id` 查询详情”。在 `docs/api-contract.md` 更新工具总览、商品详情输入示例与商品输入说明，加入：

```json
{
  "product_id": "/details/example-product-sku123.html"
}
```

并写明 `product_id` 来自 `data.Products[].Url`，一项结果可继续查详情，多项结果先由用户确认。

- [ ] **Step 3: 运行工具注册测试确认通过**

Run: `npm test -- tests/unit/server.test.ts`

Expected: PASS，已注册描述准确包含搜索、唯一性、`product_id` 和禁止误传的路由规则。

### Task 4: 全量验证与提交

**Files:**
- Modify: `docs/superpowers/plans/2026-07-24-product-search-detail-routing.md`

- [ ] **Step 1: 执行完整验证**

Run: `npm test && npm run typecheck && npm run build && git diff --check`

Expected: 所有 Vitest 测试、类型检查、构建和 diff 空白检查均以退出码 0 完成。

- [ ] **Step 2: 复核变更边界**

Run: `git diff --check && git status --short && git diff -- src/products src/tools/products.ts src/app/register-tools.ts tests/unit README.md docs/api-contract.md docs/mvp-scope.md`

Expected: 只包含商品搜索/详情标识、工具路由描述、对应测试和文档；没有 PAT、`TVCMALL_API_KEY`、下游 `Authorization`、客户 PII 或 WebApi 新 route。

- [ ] **Step 3: 提交中文 Git commit**

Run:

```bash
git add src/products/product-client.ts src/products/http-product-client.ts src/products/fake-product-client.ts src/fixtures/products.ts src/tools/products.ts src/app/register-tools.ts tests/unit/http-product-client.test.ts tests/unit/search-products-tool.test.ts tests/unit/product-detail-tool.test.ts tests/unit/server.test.ts README.md docs/api-contract.md docs/mvp-scope.md docs/superpowers/plans/2026-07-24-product-search-detail-routing.md
git commit -m "优化：明确商品搜索与详情路由"
```

Expected: 创建一个仅包含本功能的中文提交。
