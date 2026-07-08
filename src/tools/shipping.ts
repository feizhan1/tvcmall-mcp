import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakeShippingClient } from '../shipping/fake-shipping-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import type { TokenStore } from '../storage/token-store.js';

const EstimateShippingItemInputSchema = z.object({
  sku: z.string().trim().min(1).optional(),
  product_id: z.string().trim().min(1).optional(),
  quantity: z.number().int().min(1).max(1000)
}).refine(
  (input) => Boolean(input.sku ?? input.product_id),
  { message: '需要提供 sku；product_id 仅作为兼容字段' }
);

export const EstimateShippingInputSchema = z.object({
  destination_country: z.string().trim().min(2).max(2),
  items: z.array(EstimateShippingItemInputSchema).length(1, '当前真实运费接口按单个商品 sku 估算')
});

export const EstimateShippingOutputSchema = z.object({
  destination_country: z.string(),
  currency: z.literal('USD'),
  chargeable_weight_kg: z.number(),
  item_count: z.number().int(),
  options: z.array(
    z.object({
      carrier: z.string(),
      service: z.string(),
      estimated_cost: z.number(),
      currency: z.literal('USD'),
      estimated_days: z.string()
    })
  )
});

export type EstimateShippingInput = z.infer<typeof EstimateShippingInputSchema>;

export interface ShippingToolDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  shippingClient?: ShippingClient;
  now?: () => Date;
}

export async function estimateShippingForMcp(
  input: EstimateShippingInput,
  dependencies: ShippingToolDependencies
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

  const parsedInput = EstimateShippingInputSchema.parse(input);
  const shippingClient = dependencies.shippingClient ?? new FakeShippingClient();
  const result = await shippingClient.estimateShipping(parsedInput, session);

  return {
    content: [
      {
        type: 'text',
        text: formatShippingEstimate(result)
      }
    ],
    structuredContent: { ...result }
  };
}

function formatShippingEstimate(result: z.infer<typeof EstimateShippingOutputSchema>): string {
  const lines = result.options.map((option, index) => {
    return `${index + 1}. ${option.carrier} ${option.service}: ${option.currency} ${option.estimated_cost.toFixed(2)}, ${option.estimated_days}`;
  });

  return [`目的国家：${result.destination_country}`, `计费重量：${result.chargeable_weight_kg} kg`, ...lines].join('\n');
}
