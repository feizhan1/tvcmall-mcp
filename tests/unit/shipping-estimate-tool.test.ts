import { describe, expect, it } from 'vitest';
import { estimateShippingForMcp } from '../../src/tools/shipping.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.session = null;
  }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['shipping:estimate'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('estimateShippingForMcp', () => {
  it('returns AUTH_REQUIRED when no session exists', async () => {
    const result = await estimateShippingForMcp(
      { destination_country: 'US', items: [{ product_id: 'prd_iphone_case_001', quantity: 10 }] },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), shippingClient: new FakeShippingClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('returns fake shipping options without token values', async () => {
    const result = await estimateShippingForMcp(
      { destination_country: 'US', items: [{ product_id: 'prd_iphone_case_001', quantity: 10 }] },
      {
        tokenStore: new MemoryTokenStore(activeSession),
        authClient: new FakeAuthClient(),
        shippingClient: new FakeShippingClient(),
        now: () => new Date('2026-07-07T10:00:00.000Z')
      }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      destination_country: 'US',
      currency: 'USD',
      chargeable_weight_kg: expect.any(Number),
      options: expect.arrayContaining([
        expect.objectContaining({ carrier: expect.any(String), estimated_cost: expect.any(Number) })
      ])
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
    expect(JSON.stringify(result)).not.toContain('fake-refresh-token');
  });
});
