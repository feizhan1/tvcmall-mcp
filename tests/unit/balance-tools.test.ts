import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { FakeBalanceClient } from '../../src/balance/fake-balance-client.js';
import { ListBalanceRecordsInputSchema, listBalanceRecordsForMcp } from '../../src/tools/balance.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('balance records MCP tool', () => {
  it('applies defaults and validates direction and pagination', () => {
    expect(ListBalanceRecordsInputSchema.parse({})).toEqual({ direction: 'all', page: 1, page_size: 20 });
    expect(ListBalanceRecordsInputSchema.safeParse({ direction: 'credit' }).success).toBe(false);
    expect(ListBalanceRecordsInputSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(ListBalanceRecordsInputSchema.safeParse({ page_size: 51 }).success).toBe(false);
  });

  it('returns AUTH_REQUIRED without calling the balance client', async () => {
    const balanceClient = new FakeBalanceClient();
    const list = vi.spyOn(balanceClient, 'listBalanceRecords');

    const result = await listBalanceRecordsForMcp({}, { balanceClient });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
    expect(list).not.toHaveBeenCalled();
  });

  it('returns an AI-friendly summary and controlled structured content', async () => {
    const result = await listBalanceRecordsForMcp(
      { direction: 'income', page: 1, page_size: 10 },
      { authContext, balanceClient: new FakeBalanceClient() }
    );

    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('余额获取流水') })
    ]);
    expect(result.structuredContent).toMatchObject({ direction: 'income', page: 1, page_size: 10, total: 2 });
    expect(JSON.stringify(result)).not.toContain(pat);
    expect(JSON.stringify(result)).not.toContain('UserID');
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });
});
