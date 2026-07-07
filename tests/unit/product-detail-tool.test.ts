import { describe, expect, it } from 'vitest';
import { getProductDetailForMcp } from '../../src/tools/products.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';
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
  scopes: ['products:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('getProductDetailForMcp', () => {
  it('returns AUTH_REQUIRED when no session exists', async () => {
    const result = await getProductDetailForMcp(
      { product_id: 'prd_iphone_case_001' },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), productClient: new FakeProductClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('returns fake product detail without token values', async () => {
    const result = await getProductDetailForMcp(
      { product_id: 'prd_iphone_case_001' },
      {
        tokenStore: new MemoryTokenStore(activeSession),
        authClient: new FakeAuthClient(),
        productClient: new FakeProductClient(),
        now: () => new Date('2026-07-07T10:00:00.000Z')
      }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      id: 'prd_iphone_case_001',
      sku: 'TVC-IP15-CASE-CLEAR',
      title: expect.stringMatching(/iPhone 15/i),
      price: 3.98,
      currency: 'USD',
      moq: expect.any(Number),
      attributes: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
    expect(JSON.stringify(result)).not.toContain('fake-refresh-token');
  });

  it('returns PRODUCT_NOT_FOUND for missing fake products', async () => {
    const result = await getProductDetailForMcp(
      { product_id: 'missing_product' },
      {
        tokenStore: new MemoryTokenStore(activeSession),
        authClient: new FakeAuthClient(),
        productClient: new FakeProductClient()
      }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PRODUCT_NOT_FOUND');
  });
});
