import { describe, expect, it } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { GetProductDetailInputSchema, getProductDetailForMcp, searchProductsForMcp } from '../../src/tools/products.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('getProductDetailForMcp', () => {
  it('returns product detail for a detail path returned by product search without PAT values', async () => {
    const productClient = new FakeProductClient();
    const searchResult = await searchProductsForMcp(
      { query: 'TVC-IP15-CASE-CLEAR', page: 1, page_size: 1 },
      { authContext, productClient }
    );
    const searchContent = searchResult.structuredContent as { items: Array<{ product_id: string }> };
    const productId = searchContent.items[0]?.product_id;

    expect(productId).toMatch(/^\/details\//);

    const result = await getProductDetailForMcp({ product_id: productId ?? '' }, { authContext, productClient });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ id: 'prd_iphone_case_001', sku: 'TVC-IP15-CASE-CLEAR', title: expect.stringMatching(/iPhone 15/i), price: 3.98, currency: 'USD' });
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('returns PRODUCT_NOT_FOUND for missing products', async () => {
    const result = await getProductDetailForMcp({ product_id: '/details/missing-product.html' }, { authContext, productClient: new FakeProductClient() });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PRODUCT_NOT_FOUND');
  });

  it.each([
    ['SKU', 'TVC-IP15-CASE-CLEAR'],
    ['关键词', 'iphone case'],
    ['内部 ID', 'prd_iphone_case_001'],
    ['绝对 URL', 'https://tvc-mall.com/details/x.html'],
    ['详情路径边界', '/details'],
    ['近似详情路径前缀', '/details-x/item.html']
  ])('rejects a %s as product_id', (_label, productId) => {
    expect(() => GetProductDetailInputSchema.parse({ product_id: productId })).toThrow();
  });

  it('accepts a /details/ product path', () => {
    expect(GetProductDetailInputSchema.parse({ product_id: '/details/valid-product.html' })).toEqual({
      product_id: '/details/valid-product.html'
    });
  });
});
