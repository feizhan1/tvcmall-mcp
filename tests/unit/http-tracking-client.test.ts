import { describe, expect, it, vi } from 'vitest';
import { HttpTrackingClient } from '../../src/tracking/http-tracking-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['tracking:read'],
  accessToken: 'login-access-token',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpTrackingClient', () => {
  it('gets order logistics tracking with the login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        orderId: 'V26030900012',
        carrier: 'DHL',
        trackingNumber: 'DHL1234567890',
        status: 'in_transit',
        tracks: [
          { time: '2026-07-01T10:00:00Z', location: 'Shenzhen, CN', status: 'Shipment picked up' },
          { time: '2026-07-02T10:00:00Z', location: 'Hong Kong, HK', status: 'Departed facility' }
        ]
      }
    }));
    const client = new HttpTrackingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.getTrackingInfo('V26030900012', session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/order/getlogisticstracking');
    expect(parsedUrl.searchParams.get('orderId')).toBe('V26030900012');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      order_id: 'V26030900012',
      carrier: 'DHL',
      tracking_number: 'DHL1234567890',
      status: 'in_transit',
      events: [
        { time: '2026-07-01T10:00:00Z', location: 'Shenzhen, CN', status: 'Shipment picked up' },
        { time: '2026-07-02T10:00:00Z', location: 'Hong Kong, HK', status: 'Departed facility' }
      ]
    });
  });

  it('batch queries tracking by calling the documented endpoint once per order', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = input.toString();
      return jsonResponse({
        data: {
          orderId: new URL(url).searchParams.get('orderId'),
          carrier: 'Standard Air',
          trackingNumber: 'AIR9876543210',
          status: 'delivered',
          tracks: []
        }
      });
    });
    const client = new HttpTrackingClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    const result = await client.batchGetTracking(['V1', 'V2'], session);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      count: 2,
      items: [
        { order_id: 'V1', status: 'delivered' },
        { order_id: 'V2', status: 'delivered' }
      ]
    });
  });
});
