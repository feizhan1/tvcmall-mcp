import { describe, expect, it, vi } from 'vitest';
import { searchProductsForMcp } from '../../src/tools/products.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['products:read'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};

describe('searchProductsForMcp', () => {
  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 20 }, { productClient: new FakeProductClient() });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED: 缺少或无效的 TVCMall API Key');
  });

  it('returns summarized product search results without token values', async () => {
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext, productClient: new FakeProductClient() });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ query: 'iphone case', page: 1, page_size: 2, total: expect.any(Number), items: expect.any(Array) });
    expect(JSON.stringify(result)).not.toContain('short-lived-token');
  });

  it('denies product access without products:read before calling the client', async () => {
    const productClient = new FakeProductClient();
    const searchProducts = vi.spyOn(productClient, 'searchProducts');
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext: { ...authContext, scopes: [] }, productClient });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(searchProducts).not.toHaveBeenCalled();
  });
});
