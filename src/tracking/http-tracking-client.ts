import { BaseHttpClient, firstArray, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { BatchTrackingResult, TrackingClient, TrackingEvent, TrackingInfo } from './tracking-client.js';

export class HttpTrackingClient extends BaseHttpClient implements TrackingClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async getTrackingInfo(orderId: string, session: StoredAuthSession): Promise<TrackingInfo | null> {
    const response = await this.fetchImpl(this.createUrl('/order/getlogisticstracking', { orderId }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall logistics tracking'));
    if (Object.keys(payload).length === 0) return null;
    return mapTrackingInfo(payload, orderId);
  }

  async batchGetTracking(orderIds: string[], session: StoredAuthSession): Promise<BatchTrackingResult> {
    const items = (await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId, session)))).filter(
      (item): item is TrackingInfo => item !== null
    );
    return { count: items.length, items };
  }
}

function mapTrackingInfo(source: JsonObject, fallbackOrderId: string): TrackingInfo {
  return {
    order_id: readString(source, ['order_id', 'orderId', 'orderNo'], fallbackOrderId),
    carrier: readString(source, ['carrier', 'logisticsName', 'shippingName', 'expressName'], 'Unknown'),
    tracking_number: readString(source, ['tracking_number', 'trackingNumber', 'trackingNo', 'waybillNo'], 'UNKNOWN'),
    status: mapTrackingStatus(readString(source, ['status', 'trackingStatus', 'logisticsStatus'])),
    events: firstArray(source, ['events', 'tracks', 'trackingList', 'logisticsTracks']).map(mapTrackingEvent)
  };
}

function mapTrackingEvent(source: JsonObject): TrackingEvent {
  return {
    time: readString(source, ['time', 'eventTime', 'createdAt', 'date']),
    location: readString(source, ['location', 'place', 'city']),
    status: readString(source, ['status', 'description', 'desc', 'content'])
  };
}

function mapTrackingStatus(value: string): TrackingInfo['status'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('deliver')) return 'delivered';
  if (normalized.includes('transit') || normalized.includes('ship')) return 'in_transit';
  if (normalized.includes('label') || normalized.includes('created')) return 'label_created';
  return 'unknown';
}
