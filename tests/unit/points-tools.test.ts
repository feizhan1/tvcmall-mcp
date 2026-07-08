import { describe, expect, it } from 'vitest';
import { getPointsForMcp, listPointRecordsForMcp } from '../../src/tools/points.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}
  async getSession(): Promise<StoredAuthSession | null> { return this.session; }
  async saveSession(session: StoredAuthSession): Promise<void> { this.session = session; }
  async clearSession(): Promise<void> { this.session = null; }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['points:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('points MCP tools', () => {
  it('getPointsForMcp returns AUTH_REQUIRED when no session exists', async () => {
    const result = await getPointsForMcp({}, {
      tokenStore: new MemoryTokenStore(null),
      authClient: new FakeAuthClient(),
      pointsClient: new FakePointsClient()
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('getPointsForMcp returns customer points without token values', async () => {
    const result = await getPointsForMcp({}, {
      tokenStore: new MemoryTokenStore(activeSession),
      authClient: new FakeAuthClient(),
      pointsClient: new FakePointsClient()
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      available_points: 120,
      pending_points: 5,
      total_earned: 300,
      total_used: 175
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
  });

  it('listPointRecordsForMcp returns paginated point records without token values', async () => {
    const result = await listPointRecordsForMcp({ page: 1, page_size: 10 }, {
      tokenStore: new MemoryTokenStore(activeSession),
      authClient: new FakeAuthClient(),
      pointsClient: new FakePointsClient()
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      page: 1,
      page_size: 10,
      total: 2,
      items: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
  });
});
