import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakePointsClient } from '../points/fake-points-client.js';
import type { PointsClient } from '../points/points-client.js';
import type { TokenStore } from '../storage/token-store.js';

export const GetPointsInputSchema = z.object({});

export const PointsStatOutputSchema = z.object({
  available_points: z.number().int(),
  pending_points: z.number().int(),
  total_earned: z.number().int(),
  total_used: z.number().int()
});

export const ListPointRecordsInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(50).default(20)
});

const PointRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  points: z.number().int(),
  description: z.string(),
  created_at: z.string()
});

export const ListPointRecordsOutputSchema = z.object({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(PointRecordSchema)
});

export type GetPointsInput = z.infer<typeof GetPointsInputSchema>;
export type ListPointRecordsInput = z.infer<typeof ListPointRecordsInputSchema>;

export interface PointsToolDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  pointsClient?: PointsClient;
  now?: () => Date;
}

export async function getPointsForMcp(_input: GetPointsInput, dependencies: PointsToolDependencies): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, { authClient: dependencies.authClient, now: dependencies.now });
  if (!session) return authRequiredResult();

  const pointsClient = dependencies.pointsClient ?? new FakePointsClient();
  const result = await pointsClient.getPoints(session);

  return {
    content: [{ type: 'text', text: `可用积分：${result.available_points}，待生效：${result.pending_points}` }],
    structuredContent: { ...result }
  };
}

export async function listPointRecordsForMcp(input: ListPointRecordsInput, dependencies: PointsToolDependencies): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, { authClient: dependencies.authClient, now: dependencies.now });
  if (!session) return authRequiredResult();

  const parsedInput = ListPointRecordsInputSchema.parse(input);
  const pointsClient = dependencies.pointsClient ?? new FakePointsClient();
  const result = await pointsClient.listPointRecords(parsedInput, session);

  return {
    content: [{ type: 'text', text: `找到 ${result.total} 条积分记录，当前返回 ${result.items.length} 条。` }],
    structuredContent: { ...result }
  };
}

function authRequiredResult(): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
}
