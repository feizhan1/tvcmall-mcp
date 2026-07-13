import { describe, expect, it } from 'vitest';
import { getProductDetailForMcp } from '../../src/tools/products.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['products:read'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};

describe('getProductDetailForMcp', () => {
  it('returns product detail without short-lived token values', async () => {
    const result = await getProductDetailForMcp({ product_id: 'prd_iphone_case_001' }, { authContext, productClient: new FakeProductClient() });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ id: 'prd_iphone_case_001', sku: 'TVC-IP15-CASE-CLEAR', title: expect.stringMatching(/iPhone 15/i), price: 3.98, currency: 'USD' });
    expect(JSON.stringify(result)).not.toContain('short-lived-token');
  });

  it('returns PRODUCT_NOT_FOUND for missing products', async () => {
    const result = await getProductDetailForMcp({ product_id: 'missing_product' }, { authContext, productClient: new FakeProductClient() });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PRODUCT_NOT_FOUND');
  });
});
