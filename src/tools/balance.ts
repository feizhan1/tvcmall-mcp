import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { toStoredAuthSession, type RequestAuthContext } from '../auth/request-auth-context.js';
import { FakeBalanceClient } from '../balance/fake-balance-client.js';
import type { BalanceClient } from '../balance/balance-client.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';

export const ListBalanceRecordsInputSchema = z.object({
  direction: z.enum(['all', 'income', 'expense']).default('all'),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(50).default(20)
});

const BalanceRecordSchema = z.object({
  id: z.string(),
  amount: z.number(),
  formatted_amount: z.string(),
  direction: z.enum(['income', 'expense', 'unknown']),
  type: z.string(),
  description: z.string(),
  order_id: z.string(),
  display_date: z.string(),
  created_at: z.string()
});

export const ListBalanceRecordsOutputSchema = z.object({
  direction: z.enum(['all', 'income', 'expense']),
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(BalanceRecordSchema)
});

export type ListBalanceRecordsInput = z.input<typeof ListBalanceRecordsInputSchema>;

export interface BalanceToolDependencies {
  authContext?: RequestAuthContext;
  balanceClient?: BalanceClient;
}

export async function listBalanceRecordsForMcp(
  input: ListBalanceRecordsInput,
  dependencies: BalanceToolDependencies
): Promise<CallToolResult> {
  const session = dependencies.authContext?.pat && toStoredAuthSession(dependencies.authContext);
  if (!session) return authRequiredResult();

  const parsedInput = ListBalanceRecordsInputSchema.parse(input);
  const result = await (dependencies.balanceClient ?? new FakeBalanceClient()).listBalanceRecords(parsedInput, session);
  const label = result.direction === 'income' ? '余额获取' : result.direction === 'expense' ? '余额消耗' : '余额';

  return {
    content: [{ type: 'text', text: `找到 ${result.total} 条${label}流水，当前返回 ${result.items.length} 条。` }],
    structuredContent: { ...result }
  };
}

function authRequiredResult(): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
}
