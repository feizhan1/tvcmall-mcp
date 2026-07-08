import { describe, expect, it, vi } from 'vitest';
import { HttpProductClient } from '../../src/products/http-product-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['products:read'],
  accessToken: 'login-access-token',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpProductClient', () => {
  it('searches products through the documented endpoint using the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        total: 1,
        list: [
          {
            productId: 'prd_1',
            sku: 'SKU-1',
            productName: 'iPhone Case',
            price: '3.50',
            stock: 12,
            categoryName: 'Phone Cases',
            brief: 'Clear case'
          }
        ]
      }
    }));
    const client = new HttpProductClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.searchProducts({ query: 'iphone case', page: 2, page_size: 40 }, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/product/list/search/mapping');
    expect(JSON.parse(parsedUrl.searchParams.get('body') ?? '{}')).toMatchObject({
      pageindex: 2,
      pagesize: 40,
      keywords: 'iphone case',
      url: '/search'
    });
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      query: 'iphone case',
      page: 2,
      page_size: 40,
      total: 1,
      items: [
        {
          id: 'prd_1',
          sku: 'SKU-1',
          title: 'iPhone Case',
          price: 3.5,
          currency: 'USD',
          stock_status: 'in_stock',
          category: 'Phone Cases',
          summary: 'Clear case'
        }
      ]
    });
  });

  it('gets product detail through the documented endpoint using the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        productId: 'prd_1',
        sku: 'SKU-1',
        title: 'Camera Bag',
        salePrice: 9.99,
        stockStatus: 'low_stock',
        category: 'Camera Accessories',
        description: 'PU leather half case',
        minOrderQuantity: 2,
        weight: '0.35',
        length: 18,
        width: 9,
        height: 4,
        attributes: [{ name: 'Color', value: 'Black' }],
        images: ['https://example.test/sku-1.jpg']
      }
    }));
    const client = new HttpProductClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    const detail = await client.getProductDetail('/details/camera-bag.html', session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/productdetail/detail');
    expect(JSON.parse(parsedUrl.searchParams.get('body') ?? '{}')).toEqual({ url: '/details/camera-bag.html' });
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(detail).toMatchObject({
      id: 'prd_1',
      sku: 'SKU-1',
      title: 'Camera Bag',
      price: 9.99,
      currency: 'USD',
      moq: 2,
      weight_kg: 0.35,
      dimensions_cm: { length: 18, width: 9, height: 4 },
      attributes: [{ name: 'Color', value: 'Black' }],
      images: ['https://example.test/sku-1.jpg']
    });
  });
});
