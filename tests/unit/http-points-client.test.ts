import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

function sampleResponse(name: string): Response {
  return new Response(readFileSync(new URL(`../../docs/external/api-responses/${name}`, import.meta.url), 'utf8'), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpPointsClient', () => {
  it('gets customer points through the documented endpoint using a Bearer access token Authorization header', async () => {
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
    expect(url).toBe('https://api.tvcmall.test/v3/user/points/stat');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer login-access-token' });
    expect(result).toEqual({
      available_points: 120,
      pending_points: 5,
      total_earned: 300,
      total_used: 175
    });
  });

  it('lists points records through the documented endpoint using a Bearer access token Authorization header', async () => {
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
    expect(init.headers).toMatchObject({ Authorization: 'Bearer login-access-token' });
    expect(result).toEqual({
      page: 3,
      page_size: 10,
      total: 1,
      items: [
        { id: 'pt_1', type: 'earn', points: 20, description: 'Order reward', created_at: '2026-07-01T00:00:00Z' }
      ]
    });
  });

  it('maps the real points stat response sample', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('客户积分api.json'));
    const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.getPoints(session);

    expect(result).toEqual({
      available_points: 165,
      pending_points: 0,
      total_earned: 0,
      total_used: 0
    });
  });

  it('maps the real points records response sample', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('积分获取记录api.json'));
    const client = new HttpPointsClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.listPointRecords({ page: 1, page_size: 20 }, session);

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({
      id: '3786',
      type: 'ThAnniversaryPrize',
      points: 80,
      description: '18th Anniversary Prize Wheel: Earned 80 points',
      created_at: '06/25/2026'
    });
  });
});
