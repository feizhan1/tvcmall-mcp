import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import type { ProductClient } from '../products/product-client.js';
import { FakeProductClient } from '../products/fake-product-client.js';
import type { TokenStore } from '../storage/token-store.js';

export const SearchProductsInputSchema = z.object({
  query: z.string().trim().min(1),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(50).default(20)
});

export const GetProductDetailInputSchema = z.object({
  product_id: z.string().trim().min(1)
});

export const ProductSummarySchema = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  price: z.number(),
  currency: z.literal('USD'),
  stock_status: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
  category: z.string(),
  summary: z.string()
});

export const ProductDetailSchema = ProductSummarySchema.extend({
  moq: z.number().int(),
  weight_kg: z.number(),
  dimensions_cm: z.object({
    length: z.number(),
    width: z.number(),
    height: z.number()
  }),
  attributes: z.array(
    z.object({
      name: z.string(),
      value: z.string()
    })
  ),
  images: z.array(z.string())
});

export const SearchProductsOutputSchema = z.object({
  query: z.string(),
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(ProductSummarySchema)
});

export type SearchProductsInput = z.infer<typeof SearchProductsInputSchema>;
export type GetProductDetailInput = z.infer<typeof GetProductDetailInputSchema>;

export interface ProductToolDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  productClient?: ProductClient;
  now?: () => Date;
}

export async function searchProductsForMcp(
  input: SearchProductsInput,
  dependencies: ProductToolDependencies
): Promise<CallToolResult> {
  const session = await getToolSession(dependencies);

  if (!session) {
    return authRequiredResult();
  }

  const parsedInput = SearchProductsInputSchema.parse(input);
  const productClient = dependencies.productClient ?? new FakeProductClient();
  const result = await productClient.searchProducts(parsedInput, session);

  return {
    content: [
      {
        type: 'text',
        text: formatProductSearchSummary(result)
      }
    ],
    structuredContent: { ...result }
  };
}

export async function getProductDetailForMcp(
  input: GetProductDetailInput,
  dependencies: ProductToolDependencies
): Promise<CallToolResult> {
  const session = await getToolSession(dependencies);

  if (!session) {
    return authRequiredResult();
  }

  const parsedInput = GetProductDetailInputSchema.parse(input);
  const productClient = dependencies.productClient ?? new FakeProductClient();
  const detail = await productClient.getProductDetail(parsedInput.product_id, session);

  if (!detail) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `PRODUCT_NOT_FOUND: 未找到商品 ${parsedInput.product_id}`
        }
      ]
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `${detail.title} (${detail.sku})\n价格：${detail.currency} ${detail.price.toFixed(2)}\nMOQ：${detail.moq}\n库存：${detail.stock_status}`
      }
    ],
    structuredContent: { ...detail }
  };
}

async function getToolSession(dependencies: ProductToolDependencies) {
  return getActiveSession(dependencies.tokenStore, {
    authClient: dependencies.authClient,
    now: dependencies.now
  });
}

function authRequiredResult(): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: MCP_ERROR_MESSAGES.AUTH_REQUIRED
      }
    ]
  };
}

function formatProductSearchSummary(result: z.infer<typeof SearchProductsOutputSchema>): string {
  if (result.items.length === 0) {
    return `未找到匹配商品：${result.query}`;
  }

  const lines = result.items.map((item, index) => {
    return `${index + 1}. ${item.title} (${item.sku}) - ${item.currency} ${item.price.toFixed(2)} - ${item.stock_status}`;
  });

  return [`找到 ${result.total} 个匹配商品，当前返回 ${result.items.length} 个：`, ...lines].join('\n');
}
