import type { BatchTrackingResult, TrackingClient, TrackingInfo } from './tracking-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

const FAKE_TRACKING: TrackingInfo[] = [
  {
    order_id: 'V10001',
    carrier: 'DHL',
    tracking_number: 'DHL1234567890',
    status: 'in_transit',
    events: [
      { time: '2026-06-19T09:00:00Z', location: 'Shenzhen, CN', status: 'Shipment picked up' },
      { time: '2026-06-20T21:30:00Z', location: 'Hong Kong, HK', status: 'Departed facility' }
    ]
  },
  {
    order_id: 'V10002',
    carrier: 'Standard Air',
    tracking_number: 'AIR9876543210',
    status: 'delivered',
    events: [
      { time: '2026-06-23T10:00:00Z', location: 'Shenzhen, CN', status: 'Shipment accepted' },
      { time: '2026-06-30T15:20:00Z', location: 'New York, US', status: 'Delivered' }
    ]
  },
  {
    order_id: 'V10003',
    carrier: 'Pending',
    tracking_number: 'PENDING',
    status: 'label_created',
    events: [
      { time: '2026-07-02T08:00:00Z', location: 'TVCMall Warehouse', status: 'Label created' }
    ]
  }
];

export class FakeTrackingClient implements TrackingClient {
  async getTrackingInfo(orderId: string, _session: StoredAuthSession): Promise<TrackingInfo | null> {
    return FAKE_TRACKING.find((tracking) => tracking.order_id === orderId) ?? null;
  }

  async batchGetTracking(orderIds: string[], session: StoredAuthSession): Promise<BatchTrackingResult> {
    const items = (await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId, session)))).filter(
      (item): item is TrackingInfo => item !== null
    );
    return { count: items.length, items };
  }
}
