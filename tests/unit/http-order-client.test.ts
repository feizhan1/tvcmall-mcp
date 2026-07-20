import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HttpOrderClient } from '../../src/orders/http-order-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['orders:read'],
  accessToken: 'tmcp_v1_token-id.secret-value',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function sampleResponse(name: string): Response {
  return new Response(readFileSync(new URL(`../../docs/external/api-responses/${name}`, import.meta.url), 'utf8'), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpOrderClient', () => {
  it('lists orders through the existing WebApi route using the session PAT once as Bearer', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        total: 1,
        list: [
          {
            orderId: 'M24072400005',
            status: 'shipped',
            createTime: '2026-07-01',
            itemCount: 3,
            orderAmount: '29.90',
            currency: 'USD'
          }
        ]
      }
    }));
    const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.listOrders({ page: 1, page_size: 10, status: 'shipped' }, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tvcmall.test/v3/user/getorders');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tmcp_v1_token-id.secret-value', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      keywords: '',
      pageindex: 1,
      pagesize: 10,
      status: 'shipped',
      withdetail: true
    });
    expect(result).toEqual({
      page: 1,
      page_size: 10,
      total: 1,
      items: [
        {
          id: 'M24072400005',
          status: 'shipped',
          created_at: '2026-07-01',
          item_count: 3,
          total_amount: 29.9,
          currency: 'USD'
        }
      ]
    });
  });

  it('gets order detail through the existing WebApi route using the same session PAT', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        orderId: 'M24072400005',
        status: 'delivered',
        createTime: '2026-07-02',
        currency: 'USD',
        totalAmount: 49.5,
        items: [
          { productId: 'prd_1', sku: 'SKU-1', title: 'Cable', quantity: 5, price: 2.5, currency: 'USD' }
        ],
        shippingAddress: { country: 'US', city: 'Los Angeles', postcode: '90001' },
        subtotal: 12.5,
        shippingFee: 37,
        grandTotal: 49.5
      }
    }));
    const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    const detail = await client.getOrderDetail('M24072400005', session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/order/detail');
    expect(parsedUrl.searchParams.get('orderId')).toBe('M24072400005');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tmcp_v1_token-id.secret-value' });
    expect(detail).toEqual({
      id: 'M24072400005',
      status: 'delivered',
      created_at: '2026-07-02',
      item_count: 5,
      total_amount: 49.5,
      currency: 'USD',
      items: [
        { product_id: 'prd_1', sku: 'SKU-1', title: 'Cable', quantity: 5, unit_price: 2.5, currency: 'USD' }
      ],
      shipping_address: { country: 'US', city: 'Los Angeles', masked_postcode: '90***' },
      totals: { subtotal: 12.5, shipping: 37, grand_total: 49.5, currency: 'USD' }
    });
  });

  it('maps the real order list response sample', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('订单列表api.json'));
    const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.listOrders({ page: 1, page_size: 10 }, session);

    expect(result.total).toBe(1545);
    expect(result.items).toHaveLength(10);
    expect(result.items[0]).toEqual({
      id: 'V26041400008',
      status: 'pending',
      created_at: '2026-04-14 03:34:59',
      item_count: 5,
      total_amount: 6.68,
      currency: 'USD'
    });
  });

  it('maps the real order detail response sample', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('订单详情api.json'));
    const client = new HttpOrderClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const detail = await client.getOrderDetail('V26041400008', session);

    expect(detail).toEqual({
      id: 'V26041400008',
      status: 'pending',
      created_at: '2026-04-14 03:34:59',
      item_count: 5,
      total_amount: 6.68,
      currency: 'USD',
      items: expect.arrayContaining([
        {
          product_id: '661100432A',
          sku: '661100432A',
          title: 'Bulk Purchasing DUX DUCIS For Samsung Galaxy S4 mini  Sunflower Pattern Stand Cover with Hand Strap - Red',
          quantity: 1,
          unit_price: 4.29,
          currency: 'USD'
        }
      ]),
      shipping_address: { country: 'Turkey', city: 'Sample City', masked_postcode: '12***' },
      totals: { subtotal: 6.17, shipping: 0, grand_total: 6.68, currency: 'USD' }
    });
  });
});
