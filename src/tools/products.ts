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

export const SearchProductsOutputSchema = z.object({
  query: z.string(),
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(ProductSummarySchema)
});

export type SearchProductsInput = z.infer<typeof SearchProductsInputSchema>;

export interface SearchProductsDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  productClient?: ProductClient;
  now?: () => Date;
}

export async function searchProductsForMcp(
  input: SearchProductsInput,
  dependencies: SearchProductsDependencies
): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, {
    authClient: dependencies.authClient,
    now: dependencies.now
  });

  if (!session) {
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

function formatProductSearchSummary(result: z.infer<typeof SearchProductsOutputSchema>): string {
  if (result.items.length === 0) {
    return `未找到匹配商品：${result.query}`;
  }

  const lines = result.items.map((item, index) => {
    return `${index + 1}. ${item.title} (${item.sku}) - ${item.currency} ${item.price.toFixed(2)} - ${item.stock_status}`;
  });

  return [`找到 ${result.total} 个匹配商品，当前返回 ${result.items.length} 个：`, ...lines].join('\n');
}
