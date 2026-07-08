import { describe, expect, it, vi } from 'vitest';
import { HttpPointsClient } from '../../src/points/http-points-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['points:read'],
  accessToken: 'login-access-token',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpPointsClient', () => {
  it('gets customer points through the documented endpoint using the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        availablePoints: 120,
        pendingPoints: 5,
        totalEarned: 300,
        totalUsed: 175
      }
    }));
    const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.getPoints(session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tvcmall.test/m/user/points/stat');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      available_points: 120,
      pending_points: 5,
      total_earned: 300,
      total_used: 175
    });
  });

  it('lists points records through the documented endpoint using the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        total: 1,
        list: [
          { id: 'pt_1', type: 'earn', points: 20, description: 'Order reward', createdAt: '2026-07-01T00:00:00Z' }
        ]
      }
    }));
    const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    const result = await client.listPointRecords({ page: 3, page_size: 10 }, session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/user/points/list');
    expect(parsedUrl.searchParams.get('pageindex')).toBe('3');
    expect(parsedUrl.searchParams.get('pagesize')).toBe('10');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      page: 3,
      page_size: 10,
      total: 1,
      items: [
        { id: 'pt_1', type: 'earn', points: 20, description: 'Order reward', created_at: '2026-07-01T00:00:00Z' }
      ]
    });
  });
});
