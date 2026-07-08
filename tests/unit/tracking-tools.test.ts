import { describe, expect, it } from 'vitest';
import { TrackingInfoOutputSchema, batchGetTrackingForMcp, getTrackingInfoForMcp } from '../../src/tools/tracking.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';
import type { BatchTrackingResult, TrackingClient, TrackingInfo } from '../../src/tracking/tracking-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}

  async getSession(): Promise<StoredAuthSession | null> { return this.session; }
  async saveSession(session: StoredAuthSession): Promise<void> { this.session = session; }
  async clearSession(): Promise<void> { this.session = null; }
}

class ShippingTrackingClient implements TrackingClient {
  async getTrackingInfo(orderId: string): Promise<TrackingInfo | null> {
    return {
      order_id: orderId,
      carrier: 'dhl',
      tracking_number: 'YT2430621266059602',
      status: 'delivered',
      shipping: {
        carrier: 'dhl',
        service: 'Logistics Tracking',
        estimated_cost: 18.6,
        currency: 'USD',
        estimated_days: '7-12 days',
        chargeable_weight_kg: 1.2
      },
      events: [
        { time: '2024-11-17 17:31:07', location: '', status: 'Delivered' }
      ]
    } as TrackingInfo;
  }

  async batchGetTracking(orderIds: string[]): Promise<BatchTrackingResult> {
    const items = await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId)));
    return { count: items.length, items: items.filter((item): item is TrackingInfo => item !== null) };
  }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['tracking:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('tracking MCP tools', () => {
  it('getTrackingInfoForMcp returns AUTH_REQUIRED when no session exists', async () => {
    const result = await getTrackingInfoForMcp(
      { order_id: 'V10001' },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('getTrackingInfoForMcp returns fake tracking info without token values', async () => {
    const result = await getTrackingInfoForMcp(
      { order_id: 'V10001' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      order_id: 'V10001',
      carrier: expect.any(String),
      tracking_number: expect.any(String),
      events: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
  });

  it('getTrackingInfoForMcp exposes order shipping fee through the tracking tool summary and structured content', async () => {
    const result = await getTrackingInfoForMcp(
      { order_id: 'V24011000008' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), trackingClient: new ShippingTrackingClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.content?.[0]).toMatchObject({ type: 'text', text: expect.stringContaining('运费：USD 18.60') });
    expect(result.structuredContent).toMatchObject({
      order_id: 'V24011000008',
      shipping: {
        carrier: 'dhl',
        service: 'Logistics Tracking',
        estimated_cost: 18.6,
        currency: 'USD',
        estimated_days: '7-12 days',
        chargeable_weight_kg: 1.2
      }
    });
  });

  it('TrackingInfoOutputSchema preserves optional shipping fee details', () => {
    const parsed = TrackingInfoOutputSchema.parse({
      order_id: 'V24011000008',
      carrier: 'dhl',
      tracking_number: 'YT2430621266059602',
      status: 'delivered',
      shipping: {
        carrier: 'dhl',
        service: 'Logistics Tracking',
        estimated_cost: 18.6,
        currency: 'USD',
        estimated_days: '7-12 days',
        chargeable_weight_kg: 1.2
      },
      events: []
    });

    expect(parsed.shipping).toEqual({
      carrier: 'dhl',
      service: 'Logistics Tracking',
      estimated_cost: 18.6,
      currency: 'USD',
      estimated_days: '7-12 days',
      chargeable_weight_kg: 1.2
    });
  });

  it('batchGetTrackingForMcp returns multiple tracking records', async () => {
    const result = await batchGetTrackingForMcp(
      { order_ids: ['V10001', 'V10002'] },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), trackingClient: new FakeTrackingClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      count: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ order_id: 'V10001' }),
        expect.objectContaining({ order_id: 'V10002' })
      ])
    });
  });
});
