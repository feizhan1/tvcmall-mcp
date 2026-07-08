import { describe, expect, it, vi } from 'vitest';
import { HttpShippingClient } from '../../src/shipping/http-shipping-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['shipping:estimate'],
  accessToken: 'login-access-token',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpShippingClient', () => {
  it('computes product destination shipping with sku body query and login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        countrycode: 'AO',
        quantity: 1,
        chargeableWeight: '0.3',
        logistics: [
          {
            shippingname: 'DHL',
            method: 'Express Worldwide',
            freight: '18.60',
            deliverytime: '7-12 days'
          }
        ]
      }
    }));
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.estimateShipping({
      destination_country: 'AO',
      items: [{ sku: '684000085E', quantity: 1 }]
    }, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/productdetail/shipping/compute');
    expect(JSON.parse(parsedUrl.searchParams.get('body') ?? '')).toEqual({
      sku: '684000085E',
      quantity: 1,
      countrycode: 'AO'
    });
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      destination_country: 'AO',
      currency: 'USD',
      chargeable_weight_kg: 0.3,
      item_count: 1,
      options: [
        {
          carrier: 'DHL',
          service: 'Express Worldwide',
          estimated_cost: 18.6,
          currency: 'USD',
          estimated_days: '7-12 days'
        }
      ]
    });
  });

  it('requires a sku because the real product shipping API is sku based', async () => {
    const fetchMock = vi.fn();
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    await expect(client.estimateShipping({ destination_country: 'US', items: [{ quantity: 1 }] }, session)).rejects.toThrow('sku');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
