import { BaseHttpClient, firstArray, readInteger, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ShippingClient, ShippingEstimateInput, ShippingEstimateResult, ShippingOption } from './shipping-client.js';

export class HttpShippingClient extends BaseHttpClient implements ShippingClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async estimateShipping(input: ShippingEstimateInput, session: StoredAuthSession): Promise<ShippingEstimateResult> {
    const item = input.items[0];
    const sku = item?.sku ?? item?.product_id;
    if (!sku) throw new Error('HTTP product shipping estimate requires sku');

    const countryCode = input.destination_country.toUpperCase();
    const body = JSON.stringify({ sku, quantity: item.quantity, countrycode: countryCode });
    const response = await this.fetchImpl(this.createUrl('/v3/productdetail/shipping/compute', { body }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall product shipping estimate'));
    const options = mapShippingOptions(payload);

    return {
      destination_country: readString(payload, ['destination_country', 'destinationCountry', 'countrycode', 'countryCode', 'country'], countryCode).toUpperCase(),
      currency: 'USD',
      chargeable_weight_kg: readNumber(payload, ['chargeable_weight_kg', 'chargeableWeight', 'weight', 'weightKg']),
      item_count: readInteger(payload, ['item_count', 'itemCount', 'quantity'], item.quantity),
      options
    };
  }
}

function mapShippingOptions(source: JsonObject): ShippingOption[] {
  const rawOptions = firstArray(source, ['options', 'shippingOptions', 'shippingMethods', 'logistics', 'methods', 'items', 'list']);
  if (rawOptions.length > 0) return rawOptions.map(mapShippingOption);
  return [mapShippingOption(source)];
}

function mapShippingOption(source: JsonObject): ShippingOption {
  return {
    carrier: readString(source, ['carrier', 'logisticsName', 'shippingName', 'shippingname', 'expressName', 'name'], 'Unknown'),
    service: readString(source, ['service', 'serviceName', 'shippingMethod', 'method', 'shippingName', 'shippingname', 'logisticsName'], 'Product Shipping Estimate'),
    estimated_cost: readNumber(source, ['estimated_cost', 'estimatedCost', 'shippingFee', 'freight', 'freightAmount', 'price', 'cost', 'fee', 'amount']),
    currency: 'USD',
    estimated_days: readString(source, ['estimated_days', 'estimatedDays', 'deliveryTime', 'deliverytime', 'timeLimit', 'days'], 'unknown')
  };
}
