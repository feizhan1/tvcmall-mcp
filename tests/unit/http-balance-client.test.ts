import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { HttpBalanceClient } from '../../src/balance/http-balance-client.js';
import type { BalanceDirectionFilter } from '../../src/balance/balance-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const pat = 'tmcp_v1_token-id.secret-value';
const session: StoredAuthSession = {
  customer: { id: 'fixture-customer', email: 'fixture@example.test' },
  scopes: [],
  accessToken: pat
};

describe('HttpBalanceClient', () => {
  it.each<[BalanceDirectionFilter, string]>([
    ['all', '0'],
    ['income', '1'],
    ['expense', '2']
  ])('maps %s to pointstype=%s and forwards the session PAT once', async (direction, pointsType) => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { model: { Total: 0, Balance: [] } } }));
    const client = new HttpBalanceClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    await client.listBalanceRecords({ direction, page: 3, page_size: 10 }, session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/user/balance/list');
    expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({ pageindex: '3', pagesize: '10', pointstype: pointsType });
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${pat}` });
    expect(JSON.stringify(init.headers)).not.toContain('Bearer Bearer');
  });

  it('maps the supplied balance response without exposing UserID', async () => {
    const body = readFileSync(new URL('../../docs/external/api-responses/余额流水api.json', import.meta.url), 'utf8');
    const client = new HttpBalanceClient({
      baseUrl: 'https://api.tvcmall.test',
      fetch: vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
    });

    const result = await client.listBalanceRecords({ direction: 'all', page: 1, page_size: 20 }, session);

    expect(result.total).toBe(398);
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual({
      id: '113764',
      amount: 94.16,
      formatted_amount: '$94.16',
      direction: 'income',
      type: 'WaitUseBalanceToOrder-Revoked',
      description: '(Revoked)Wait For UseBalanceToOrder',
      order_id: 'V26071500020',
      display_date: '07/15/2026',
      created_at: '2026-07-15 11:21:14'
    });
    expect(JSON.stringify(result)).not.toContain('UserID');
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('uses unknown for an undocumented PointsType instead of guessing from amount', async () => {
    const client = new HttpBalanceClient({
      baseUrl: 'https://api.tvcmall.test',
      fetch: vi.fn(async () => jsonResponse({ data: { model: { Total: 1, Balance: [{ ID: 9, Value: -1, PointsType: 9 }] } } }))
    });

    const result = await client.listBalanceRecords({ direction: 'all', page: 1, page_size: 20 }, session);

    expect(result.items[0]?.direction).toBe('unknown');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
