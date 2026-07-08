import { BaseHttpClient, firstArray, firstObject, isJsonObject, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { BatchTrackingResult, TrackingClient, TrackingEvent, TrackingInfo, TrackingShippingInfo } from './tracking-client.js';

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
    const trackingSource = firstPackage(payload);
    if (trackingSource === null) return null;
    return mapTrackingInfo(trackingSource ?? payload, orderId, payload);
  }

  async batchGetTracking(orderIds: string[], session: StoredAuthSession): Promise<BatchTrackingResult> {
    const items = (await Promise.all(orderIds.map((orderId) => this.getTrackingInfo(orderId, session)))).filter(
      (item): item is TrackingInfo => item !== null
    );
    return { count: items.length, items };
  }
}

function mapTrackingInfo(source: JsonObject, fallbackOrderId: string, rootSource = source): TrackingInfo {
  const trackingDetails = firstObject(source, ['TrackingInfo', 'trackingInfo']) ?? source;
  const events = mapTrackingEvents(source, trackingDetails);
  const carrier = readString(source, ['carrier', 'logisticsName', 'shippingName', 'expressName', 'CourierNumber'], readString(trackingDetails, ['com'], 'Unknown'));
  const trackingNumber = readString(source, ['tracking_number', 'trackingNumber', 'trackingNo', 'waybillNo', 'TrackingNumber'], readString(trackingDetails, ['nu'], 'UNKNOWN'));
  const shipping = mapTrackingShipping([source, trackingDetails, rootSource], carrier);

  const tracking: TrackingInfo = {
    order_id: readString(source, ['order_id', 'orderId', 'orderNo'], fallbackOrderId),
    carrier,
    tracking_number: trackingNumber,
    status: mapTrackingStatusFromCandidates([
      readString(source, ['status', 'trackingStatus', 'logisticsStatus']),
      readString(trackingDetails, ['state', 'logisticsState', 'trackingState']),
      readString(trackingDetails, ['status', 'condition']),
      events[0]?.status ?? ''
    ]),
    events
  };

  if (shipping) tracking.shipping = shipping;
  return tracking;
}

function mapTrackingEvent(source: JsonObject): TrackingEvent {
  return {
    time: readString(source, ['time', 'ftime', 'eventTime', 'createdAt', 'date']),
    location: readString(source, ['location', 'place', 'city']),
    status: readString(source, ['status', 'description', 'desc', 'content', 'context'])
  };
}

function firstPackage(source: JsonObject): JsonObject | null | undefined {
  for (const key of ['packages', 'Packages']) {
    const value = source[key];
    if (Array.isArray(value)) return value.find(isJsonObject) ?? null;
  }
  return undefined;
}

function mapTrackingEvents(source: JsonObject, trackingDetails: JsonObject): TrackingEvent[] {
  const directEvents = firstArray(source, ['events', 'tracks', 'trackingList', 'logisticsTracks']);
  const nestedEvents = firstArray(trackingDetails, ['data', 'events', 'tracks', 'trackingList', 'logisticsTracks']);
  return (directEvents.length > 0 ? directEvents : nestedEvents).map(mapTrackingEvent);
}

function mapTrackingShipping(sources: JsonObject[], carrier: string): TrackingShippingInfo | undefined {
  const estimatedCost = readFirstNumber(sources, [
    'shippingFee',
    'ShippingFee',
    'shipping_fee',
    'shippingCost',
    'ShippingCost',
    'freight',
    'Freight',
    'estimated_cost',
    'estimatedCost',
    'price',
    'cost',
    'Cost',
    'amount'
  ]);
  if (estimatedCost === undefined) return undefined;

  const chargeableWeight = readFirstNumber(sources, [
    'chargeable_weight_kg',
    'chargeableWeightKg',
    'chargeableWeight',
    'ChargeableWeight',
    'weightKg',
    'WeightKg',
    'weight',
    'Weight'
  ]);

  return {
    carrier,
    service: readFirstString(sources, ['service', 'Service', 'serviceName', 'ServiceName', 'shippingMethod', 'ShippingMethod', 'method', 'Method'], 'Logistics Tracking'),
    estimated_cost: estimatedCost,
    currency: 'USD',
    estimated_days: readFirstString(sources, ['estimated_days', 'estimatedDays', 'EstimatedDays', 'estimateDeliveryTime', 'EstimateDeliveryTime', 'deliveryTime', 'DeliveryTime', 'days'], 'unknown'),
    ...(chargeableWeight === undefined ? {} : { chargeable_weight_kg: chargeableWeight })
  };
}

function readFirstString(sources: JsonObject[], keys: string[], fallback = ''): string {
  for (const source of sources) {
    const value = readString(source, keys);
    if (value) return value;
  }
  return fallback;
}

function readFirstNumber(sources: JsonObject[], keys: string[]): number | undefined {
  for (const source of sources) {
    const value = readNumber(source, keys, Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function mapTrackingStatusFromCandidates(values: string[]): TrackingInfo['status'] {
  for (const value of values) {
    const status = mapTrackingStatus(value);
    if (status !== 'unknown') return status;
  }
  return 'unknown';
}

function mapTrackingStatus(value: string): TrackingInfo['status'] {
  const normalized = value.toLowerCase();
  if (normalized === '3' || normalized.includes('deliver')) return 'delivered';
  if (normalized.includes('transit') || normalized.includes('ship')) return 'in_transit';
  if (normalized.includes('label') || normalized.includes('created')) return 'label_created';
  return 'unknown';
}
