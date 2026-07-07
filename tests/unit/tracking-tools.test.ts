import { describe, expect, it } from 'vitest';
import { batchGetTrackingForMcp, getTrackingInfoForMcp } from '../../src/tools/tracking.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}

  async getSession(): Promise<StoredAuthSession | null> { return this.session; }
  async saveSession(session: StoredAuthSession): Promise<void> { this.session = session; }
  async clearSession(): Promise<void> { this.session = null; }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['tracking:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('tracking MCP tools', () => {
  it('getTrackingInfoForMcp returns AUTH_REQUIRED when no session exists', async () => {
    const result = await getTrackingInfoForMcp(
      { order_id: 'V10001' },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('getTrackingInfoForMcp returns fake tracking info without token values', async () => {
    const result = await getTrackingInfoForMcp(
      { order_id: 'V10001' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      order_id: 'V10001',
      carrier: expect.any(String),
      tracking_number: expect.any(String),
      events: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
  });

  it('batchGetTrackingForMcp returns multiple tracking records', async () => {
    const result = await batchGetTrackingForMcp(
      { order_ids: ['V10001', 'V10002'] },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      count: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ order_id: 'V10001' }),
        expect.objectContaining({ order_id: 'V10002' })
      ])
    });
  });
});
