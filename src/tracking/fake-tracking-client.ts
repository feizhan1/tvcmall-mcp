import { FIXTURE_TRACKING } from '../fixtures/tracking.js';
import type { BatchTrackingResult, TrackingClient, TrackingInfo } from './tracking-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

export class FakeTrackingClient implements TrackingClient {
  async getTrackingInfo(orderId: string, _session: StoredAuthSession): Promise<TrackingInfo | null> {
    return FIXTURE_TRACKING.find((tracking) => tracking.order_id === orderId) ?? null;
  }

  async batchGetTracking(orderIds: string[], session: StoredAuthSession): Promise<BatchTrackingResult> {
    const items = (await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId, session)))).filter(
      (item): item is TrackingInfo => item !== null
    );
    return { count: items.length, items };
  }
}
