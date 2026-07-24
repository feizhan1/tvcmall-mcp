import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { SearchProductsOutputSchema, searchProductsForMcp } from '../../src/tools/products.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('searchProductsForMcp', () => {
  it('returns PAT auth required when request auth context is missing', async () => {
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 20 }, { productClient: new FakeProductClient() });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED: 缺少或无效的 TVCMall MCP PAT');
  });

  it('returns summarized product search results without token values', async () => {
    const result = await searchProductsForMcp({ query: 'TVC-USBC-20W-PD', page: 1, page_size: 2 }, { authContext, productClient: new FakeProductClient() });
    const structuredContent = result.structuredContent as { items: Array<{ product_id: string }> };

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      query: 'TVC-USBC-20W-PD',
      page: 1,
      page_size: 2,
      total: expect.any(Number),
      items: expect.any(Array)
    });
    expect(structuredContent.items).toHaveLength(1);
    const parsed = SearchProductsOutputSchema.parse(result.structuredContent);
    expect(parsed.items[0]?.product_id).toMatch(/^\/details\//);
    expect(structuredContent.items[0]?.product_id).toMatch(/^\/details\//);
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('returns usable details paths for every product in a multi-result search', async () => {
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext, productClient: new FakeProductClient() });
    const structuredContent = result.structuredContent as {
      items: Array<{ title: string; sku: string; product_id: string }>;
    };

    expect(result.isError).toBeUndefined();
    expect(structuredContent.items.length).toBeGreaterThanOrEqual(2);
    for (const item of structuredContent.items) {
      expect(item.title.trim()).not.toBe('');
      expect(item.sku.trim()).not.toBe('');
      expect(item.product_id).toMatch(/^\/details\//);
    }
  });

  it('calls the product client without a local scope list', async () => {
    const productClient = new FakeProductClient();
    const searchProducts = vi.spyOn(productClient, 'searchProducts');
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext, productClient });

    expect(result.isError).toBeUndefined();
    expect(searchProducts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accessToken: pat, scopes: [] }));
  });
});
