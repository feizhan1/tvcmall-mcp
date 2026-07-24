# 商品搜索与详情路由设计

## 目标

让 MCP Client 能先用 `tvcmall_search_products` 按 SKU 或关键词定位商品，再把搜索结果中同一商品的 WebApi `Url` 作为 `product_id` 传给 `tvcmall_get_product_detail`。工具描述和结构化结果必须使模型能据此判断商品是否唯一，且不会把 SKU、关键词或内部商品 ID 误作详情入参。

## 搜索结果契约

商品搜索 WebApi 的权威商品列表为 `data.Products`。每个 MCP 商品摘要保留现有 `id`、`sku`、标题、价格和库存等字段，并新增：

```json
{
  "product_id": "/details/example-product-sku123.html"
}
```

`product_id` 的值必须直接来自同一 WebApi 商品对象的 `Url` 字段。它是唯一允许传入商品详情工具的商品标识；`id` 和 `sku` 继续用于展示和用户确认，不改变原有语义。

搜索结果的 `items` 长度表达匹配唯一性：

- 只有一项时，表示当前搜索条件唯一命中该商品；当用户需要更多信息时，模型可使用该项的 `product_id` 调用详情工具。
- 多于一项时，表示搜索条件不唯一；模型必须先要求用户按标题或 SKU 确认具体商品，不能自行选择某一项查询详情。
- 没有结果时，不调用详情工具。

## 详情输入契约

`tvcmall_get_product_detail.product_id` 保持现有字段名，但其值必须为 `tvcmall_search_products` 返回的 `items[].product_id`。该值是以 `/details/` 开头的站内商品详情相对路径；schema 拒绝 SKU、关键词、内部 ID 和其他非详情路径。

HTTP client 继续调用既有 `GET /v3/productdetail/detail`，请求 query `body` 中的 `url` 取 `product_id` 原值：

```json
{
  "url": "/details/example-product-sku123.html"
}
```

不新增 WebApi route，不修改认证、scope、日志脱敏或稳定错误映射。

## 工具描述

- `tvcmall_search_products` 明确适用于 SKU 或关键词搜索，说明搜索结果中的 `product_id` 来自 WebApi `Url`；并告知模型仅有一个结果时才可直接继续请求详情，多条结果先请用户确认。
- `tvcmall_get_product_detail` 明确只接受搜索结果的 `product_id`，以及不能传 SKU、关键词或内部 ID；查询商品时先使用搜索工具。

## 实现边界

1. 更新商品领域类型和 Zod 输出 schema，增加 `product_id`。
2. `HttpProductClient.searchProducts()` 显式读取 `data.Products`，映射每项 `Url` 到 `product_id`；保持当前回退解析以兼容测试样例和受控的旧响应形态。
3. Fake 商品 fixture 为每项商品提供等价的详情路径，Fake client 按该路径查询详情。
4. `GetProductDetailInputSchema` 限制 `product_id` 为 `/details/` 商品详情路径。
5. 同步工具注册描述、README、MVP 范围和 API 契约。

## 测试与验收

- 搜索工具的结构化结果为每项商品返回来自 `Url` 的 `product_id`。
- 真实搜索响应样例的 `data.Products` 被正确读取，且 `product_id` 等于其 `Url`。
- 详情工具接受搜索结果中的详情路径，并将它原样发送到 WebApi 请求体的 `url`。
- 详情工具拒绝 SKU、关键词和其他非 `/details/` 路径的 `product_id`。
- 注册的两项工具描述包含唯一性判断和 `product_id` 传递规则。
- 相关单元测试、完整测试、`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。

## 非目标

- 不自动串联两次 MCP tool 调用，也不在服务端保存前一次搜索结果状态。
- 不修改 `id`、`sku` 的既有含义或引入商品写操作。
- 不支持从任意 URL、SKU、关键词或内部 ID 直接获取详情。
