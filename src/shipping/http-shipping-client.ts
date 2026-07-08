import { BaseHttpClient, firstArray, readInteger, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ShippingClient, ShippingEstimateInput, ShippingEstimateResult, ShippingOption } from './shipping-client.js';

export class HttpShippingClient extends BaseHttpClient implements ShippingClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async estimateShipping(input: ShippingEstimateInput, session: StoredAuthSession): Promise<ShippingEstimateResult> {
    if (!input.order_id) {
      throw new Error('HTTP logistics shipping query requires order_id');
    }

    const response = await this.fetchImpl(this.createUrl('/order/getlogisticstracking', { orderId: input.order_id }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall logistics shipping'));
    const options = mapShippingOptions(payload);

    return {
      destination_country: readString(payload, ['destination_country', 'destinationCountry', 'country'], input.destination_country ?? 'UNKNOWN').toUpperCase(),
      currency: 'USD',
      chargeable_weight_kg: readNumber(payload, ['chargeable_weight_kg', 'chargeableWeight', 'weight', 'weightKg']),
      item_count: readInteger(payload, ['item_count', 'itemCount', 'quantity'], input.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0),
      options
    };
  }
}

function mapShippingOptions(source: JsonObject): ShippingOption[] {
  const rawOptions = firstArray(source, ['options', 'shippingOptions', 'logistics', 'methods']);
  if (rawOptions.length > 0) return rawOptions.map(mapShippingOption);
  return [mapShippingOption(source)];
}

function mapShippingOption(source: JsonObject): ShippingOption {
  return {
    carrier: readString(source, ['carrier', 'logisticsName', 'shippingName', 'expressName'], 'Unknown'),
    service: readString(source, ['service', 'serviceName', 'shippingMethod', 'method'], 'Logistics Tracking'),
    estimated_cost: readNumber(source, ['estimated_cost', 'estimatedCost', 'shippingFee', 'freight', 'price', 'cost']),
    currency: 'USD',
    estimated_days: readString(source, ['estimated_days', 'estimatedDays', 'deliveryTime', 'days'], 'unknown')
  };
}
