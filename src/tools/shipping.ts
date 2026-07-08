import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakeShippingClient } from '../shipping/fake-shipping-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import type { TokenStore } from '../storage/token-store.js';

export const EstimateShippingInputSchema = z.object({
  sku: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(1000),
  countrycode: z.string().trim().length(2).transform((value) => value.toUpperCase())
});

export const EstimateShippingOutputSchema = z.object({
  destination_country: z.string(),
  country_name: z.string().optional(),
  currency: z.string(),
  currency_details: z.object({
    code: z.string(),
    name: z.string().optional(),
    format_string: z.string().optional(),
    format2_string: z.string().optional(),
    format3_string: z.string().optional(),
    symbol: z.string().optional(),
    symbol2: z.string().optional(),
    symbol3: z.string().optional()
  }).optional(),
  chargeable_weight_kg: z.number(),
  display_weight: z.number().optional(),
  display_volume_weight: z.number().optional(),
  weight: z.number().optional(),
  volume_weight: z.number().optional(),
  item_count: z.number().int(),
  param_country_code: z.string().optional(),
  client_country_code: z.string().optional(),
  gross_weight: z.number().optional(),
  gross_volume_weight: z.number().optional(),
  options: z.array(
    z.object({
      carrier: z.string(),
      service: z.string(),
      estimated_cost: z.number(),
      currency: z.string(),
      estimated_days: z.string(),
      shipping_method: z.string().optional(),
      shipping_method_code: z.string().optional(),
      shipping_method_name: z.string().optional(),
      shipping_agent_id: z.number().int().optional(),
      selected: z.boolean().optional(),
      shipping_cost: z.number().optional(),
      shipping_cost_format: z.string().optional(),
      delivery_cycle: z.string().optional(),
      compute_weight: z.number().optional(),
      freight_fee: z.number().optional(),
      freight_fee_format: z.string().optional(),
      logo: z.string().optional(),
      shipping_type: z.number().int().optional(),
      mobile_img_host: z.string().nullable().optional(),
      tariff: z.number().optional(),
      original_shipping_cost: z.number().optional(),
      original_shipping_cost_format: z.string().optional()
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
