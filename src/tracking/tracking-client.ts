import type { StoredAuthSession } from '../storage/token-store.js';

export interface TrackingEvent {
  time: string;
  location: string;
  status: string;
}

export interface TrackingInfo {
  order_id: string;
  carrier: string;
  tracking_number: string;
  status: 'label_created' | 'in_transit' | 'delivered' | 'unknown';
  events: TrackingEvent[];
}

export interface BatchTrackingResult {
  count: number;
  items: TrackingInfo[];
}

export interface TrackingClient {
  getTrackingInfo(orderId: string, session: StoredAuthSession): Promise<TrackingInfo | null>;
  batchGetTracking(orderIds: string[], session: StoredAuthSession): Promise<BatchTrackingResult>;
}
