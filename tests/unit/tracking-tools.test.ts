import { describe, expect, it, vi } from 'vitest';
import { TrackingInfoOutputSchema, batchGetTrackingForMcp, getTrackingInfoForMcp } from '../../src/tools/tracking.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';
import type { BatchTrackingResult, TrackingClient, TrackingInfo } from '../../src/tracking/tracking-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['tracking:read'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};

class ShippingTrackingClient implements TrackingClient {
  async getTrackingInfo(orderId: string): Promise<TrackingInfo | null> {
    return {
      order_id: orderId, carrier: 'dhl', tracking_number: 'YT2430621266059602', status: 'delivered',
      shipping: { carrier: 'dhl', service: 'Logistics Tracking', estimated_cost: 18.6, currency: 'USD', estimated_days: '7-12 days', chargeable_weight_kg: 1.2 },
      events: [{ time: '2024-11-17 17:31:07', location: '', status: 'Delivered' }]
    } as TrackingInfo;
  }

  async batchGetTracking(orderIds: string[]): Promise<BatchTrackingResult> {
    const items = await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId)));
    return { count: items.length, items: items.filter((item): item is TrackingInfo => item !== null) };
  }
}

describe('tracking MCP tools', () => {
  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await getTrackingInfoForMcp({ order_id: 'V10001' }, { trackingClient: new FakeTrackingClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns tracking and shipping information without short-lived token values', async () => {
    const tracking = await getTrackingInfoForMcp({ order_id: 'V24011000008' }, { authContext, trackingClient: new ShippingTrackingClient() });
    const batch = await batchGetTrackingForMcp({ order_ids: ['V10001', 'V10002'] }, { authContext, trackingClient: new FakeTrackingClient() });

    expect(tracking.content?.[0]).toMatchObject({ type: 'text', text: expect.stringContaining('运费：USD 18.60') });
    expect(tracking.structuredContent).toMatchObject({ order_id: 'V24011000008', shipping: expect.objectContaining({ estimated_cost: 18.6 }) });
    expect(batch.structuredContent).toMatchObject({ count: 2, items: expect.any(Array) });
    expect(JSON.stringify([tracking, batch])).not.toContain('short-lived-token');
  });

  it('does not call tracking client when tracking:read is absent', async () => {
    const trackingClient = new FakeTrackingClient();
    const getTrackingInfo = vi.spyOn(trackingClient, 'getTrackingInfo');
    const result = await getTrackingInfoForMcp({ order_id: 'V10001' }, { authContext: { ...authContext, scopes: [] }, trackingClient });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(getTrackingInfo).not.toHaveBeenCalled();
  });

  it('preserves optional shipping fee details', () => {
    expect(TrackingInfoOutputSchema.parse({
      order_id: 'V24011000008', carrier: 'dhl', tracking_number: 'YT2430621266059602', status: 'delivered',
      shipping: { carrier: 'dhl', service: 'Logistics Tracking', estimated_cost: 18.6, currency: 'USD', estimated_days: '7-12 days', chargeable_weight_kg: 1.2 }, events: []
    }).shipping).toEqual({ carrier: 'dhl', service: 'Logistics Tracking', estimated_cost: 18.6, currency: 'USD', estimated_days: '7-12 days', chargeable_weight_kg: 1.2 });
  });
});
