import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { searchProductsForMcp } from '../../src/tools/products.js';
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
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext, productClient: new FakeProductClient() });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ query: 'iphone case', page: 1, page_size: 2, total: expect.any(Number), items: expect.any(Array) });
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('calls the product client without a local scope list', async () => {
    const productClient = new FakeProductClient();
    const searchProducts = vi.spyOn(productClient, 'searchProducts');
    const result = await searchProductsForMcp({ query: 'iphone case', page: 1, page_size: 2 }, { authContext, productClient });

    expect(result.isError).toBeUndefined();
    expect(searchProducts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accessToken: pat, scopes: [] }));
  });
});
