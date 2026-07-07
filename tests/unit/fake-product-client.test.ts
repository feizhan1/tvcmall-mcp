import { describe, expect, it } from 'vitest';
import { FakeProductClient } from '../../src/products/fake-product-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['products:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('FakeProductClient', () => {
  it('returns matching fake products with pagination metadata', async () => {
    const client = new FakeProductClient();

    const result = await client.searchProducts({ query: 'iphone case', page: 1, page_size: 2 }, session);

    expect(result.query).toBe('iphone case');
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: expect.any(String),
      sku: expect.any(String),
      title: expect.stringMatching(/iphone/i),
      price: expect.any(Number),
      currency: 'USD',
      stock_status: expect.any(String)
    });
  });

  it('returns an empty result for unmatched queries', async () => {
    const client = new FakeProductClient();

    const result = await client.searchProducts({ query: 'nonexistent satellite toaster', page: 1, page_size: 20 }, session);

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
