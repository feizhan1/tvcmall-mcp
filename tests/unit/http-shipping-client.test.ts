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
  it('queries order shipping fee with the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        orderId: 'V26030900012',
        destinationCountry: 'US',
        chargeableWeight: '1.25',
        itemCount: 4,
        carrier: 'DHL',
        service: 'Express Worldwide',
        shippingFee: '18.60',
        currency: 'USD',
        estimatedDays: '3-5 business days'
      }
    }));
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.estimateShipping({ order_id: 'V26030900012' }, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/order/getlogisticstracking');
    expect(parsedUrl.searchParams.get('orderId')).toBe('V26030900012');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      destination_country: 'US',
      currency: 'USD',
      chargeable_weight_kg: 1.25,
      item_count: 4,
      options: [
        {
          carrier: 'DHL',
          service: 'Express Worldwide',
          estimated_cost: 18.6,
          currency: 'USD',
          estimated_days: '3-5 business days'
        }
      ]
    });
  });

  it('requires order_id because the real logistics API is order based', async () => {
    const fetchMock = vi.fn();
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    await expect(client.estimateShipping({ destination_country: 'US', items: [{ product_id: 'prd_1', quantity: 1 }] }, session)).rejects.toThrow('order_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
