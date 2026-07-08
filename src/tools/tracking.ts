import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakeTrackingClient } from '../tracking/fake-tracking-client.js';
import type { TrackingClient } from '../tracking/tracking-client.js';
import type { TokenStore } from '../storage/token-store.js';

export const GetTrackingInfoInputSchema = z.object({
  order_id: z.string().trim().min(1)
});

export const BatchGetTrackingInputSchema = z.object({
  order_ids: z.array(z.string().trim().min(1)).min(1).max(50)
});

const TrackingInfoSchema = z.object({
  order_id: z.string(),
  carrier: z.string(),
  tracking_number: z.string(),
  status: z.enum(['label_created', 'in_transit', 'delivered', 'unknown']),
  shipping: z.object({
    carrier: z.string(),
    service: z.string(),
    estimated_cost: z.number(),
    currency: z.literal('USD'),
    estimated_days: z.string(),
    chargeable_weight_kg: z.number().optional()
  }).optional(),
  events: z.array(z.object({
    time: z.string(),
    location: z.string(),
    status: z.string()
  }))
});

export const TrackingInfoOutputSchema = TrackingInfoSchema;
export const BatchTrackingOutputSchema = z.object({
  count: z.number().int(),
  items: z.array(TrackingInfoSchema)
});

export type GetTrackingInfoInput = z.infer<typeof GetTrackingInfoInputSchema>;
export type BatchGetTrackingInput = z.infer<typeof BatchGetTrackingInputSchema>;

export interface TrackingToolDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  trackingClient?: TrackingClient;
  now?: () => Date;
}

export async function getTrackingInfoForMcp(input: GetTrackingInfoInput, dependencies: TrackingToolDependencies): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, { authClient: dependencies.authClient, now: dependencies.now });
  if (!session) return authRequiredResult();

  const parsedInput = GetTrackingInfoInputSchema.parse(input);
  const trackingClient = dependencies.trackingClient ?? new FakeTrackingClient();
  const tracking = await trackingClient.getTrackingInfo(parsedInput.order_id, session);

  if (!tracking) {
    return { isError: true, content: [{ type: 'text', text: `TRACKING_NOT_FOUND: 未找到订单物流 ${parsedInput.order_id}` }] };
  }

  return {
    content: [{ type: 'text', text: formatTrackingSummary(tracking) }],
    structuredContent: { ...tracking }
  };
}

export async function batchGetTrackingForMcp(input: BatchGetTrackingInput, dependencies: TrackingToolDependencies): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, { authClient: dependencies.authClient, now: dependencies.now });
  if (!session) return authRequiredResult();

  const parsedInput = BatchGetTrackingInputSchema.parse(input);
  const trackingClient = dependencies.trackingClient ?? new FakeTrackingClient();
  const result = await trackingClient.batchGetTracking(parsedInput.order_ids, session);

  return {
    content: [{ type: 'text', text: `批量查询 ${parsedInput.order_ids.length} 个订单，找到 ${result.count} 条物流。` }],
    structuredContent: { ...result }
  };
}

function authRequiredResult(): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
}

function formatTrackingSummary(tracking: z.infer<typeof TrackingInfoSchema>): string {
  const shipping = tracking.shipping ? ` - 运费：${tracking.shipping.currency} ${tracking.shipping.estimated_cost.toFixed(2)}` : '';
  return `${tracking.order_id} - ${tracking.carrier} - ${tracking.status}${shipping}`;
}
