import { describe, expect, it } from 'vitest';
import { searchProductsForMcp } from '../../src/tools/products.js';
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

describe('searchProductsForMcp', () => {
  it('returns AUTH_REQUIRED when no session exists', async () => {
    const result = await searchProductsForMcp(
      { query: 'iphone case', page: 1, page_size: 20 },
      {
        tokenStore: new MemoryTokenStore(null),
        authClient: new FakeAuthClient(),
        productClient: new FakeProductClient()
      }
    );

    expect(result.isError).toBe(true);
    const firstContent = result.content?.[0];
    expect(firstContent?.type).toBe('text');
    expect(firstContent?.type === 'text' ? firstContent.text : '').toContain('未登录');
  });

  it('returns summarized product search results without token values', async () => {
    const result = await searchProductsForMcp(
      { query: 'iphone case', page: 1, page_size: 2 },
      {
        tokenStore: new MemoryTokenStore(activeSession),
        authClient: new FakeAuthClient(),
        productClient: new FakeProductClient(),
        now: () => new Date('2026-07-07T10:00:00.000Z')
      }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      query: 'iphone case',
      page: 1,
      page_size: 2,
      total: expect.any(Number),
      items: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
    expect(JSON.stringify(result)).not.toContain('fake-refresh-token');
  });
});
