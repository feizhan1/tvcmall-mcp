import { BaseHttpClient, firstArray, firstObject, readInteger, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ShippingClient, ShippingCurrencyDetails, ShippingEstimateInput, ShippingEstimateResult, ShippingOption } from './shipping-client.js';

export class HttpShippingClient extends BaseHttpClient implements ShippingClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async estimateShipping(input: ShippingEstimateInput, session: StoredAuthSession): Promise<ShippingEstimateResult> {
    const sku = input.sku;
    if (!sku) throw new Error('HTTP product shipping estimate requires sku');

    const countryCode = input.countrycode.toUpperCase();
    const body = JSON.stringify({ sku, quantity: input.quantity, countrycode: countryCode });
    const response = await this.fetchImpl(this.createUrl('/v3/productdetail/shipping/compute', { body }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall product shipping estimate'));
    const currencyDetails = mapCurrencyDetails(payload);
    const currency = currencyDetails?.code ?? readString(payload, ['currency', 'Currency', 'currencyCode', 'CurrencyCode'], 'USD').toUpperCase();
    const options = mapShippingOptions(payload, currency);

    const result: ShippingEstimateResult = {
      destination_country: readString(payload, ['destination_country', 'destinationCountry', 'countrycode', 'countryCode', 'CountryCode', 'country'], countryCode).toUpperCase(),
      currency,
      chargeable_weight_kg: readNumber(payload, ['chargeable_weight_kg', 'chargeableWeight', 'chargeableWeightKg', 'DisplayWeight', 'displayWeight', 'weight', 'Weight', 'weightKg']),
      item_count: readInteger(payload, ['item_count', 'itemCount', 'quantity'], input.quantity),
      options
    };

    setIfDefined(result, 'country_name', readOptionalString(payload, ['country_name', 'countryName', 'CountryName']));
    setIfDefined(result, 'currency_details', currencyDetails);
    setIfDefined(result, 'display_weight', readOptionalNumber(payload, ['display_weight', 'displayWeight', 'DisplayWeight']));
    setIfDefined(result, 'display_volume_weight', readOptionalNumber(payload, ['display_volume_weight', 'displayVolumeWeight', 'DisplayVolumeWeight']));
    setIfDefined(result, 'weight', readOptionalNumber(payload, ['weight', 'Weight']));
    setIfDefined(result, 'volume_weight', readOptionalNumber(payload, ['volume_weight', 'volumeWeight', 'VolumeWeight']));
    setIfDefined(result, 'param_country_code', readOptionalString(payload, ['param_country_code', 'paramCountryCode', 'ParamCountryCode']));
    setIfDefined(result, 'client_country_code', readOptionalString(payload, ['client_country_code', 'clientCountryCode', 'ClientCountryCode']));
    setIfDefined(result, 'gross_weight', readOptionalNumber(payload, ['gross_weight', 'grossWeight', 'GrossWeight']));
    setIfDefined(result, 'gross_volume_weight', readOptionalNumber(payload, ['gross_volume_weight', 'grossVolumeWeight', 'GrossVolumeWeight']));

    return result;
  }
}

function mapShippingOptions(source: JsonObject, currency: string): ShippingOption[] {
  const rawOptions = firstArray(source, ['options', 'shippingOptions', 'shippingMethods', 'ShippingMethods', 'logistics', 'methods', 'items', 'list']);
  if (rawOptions.length > 0) return rawOptions.map((option) => mapShippingOption(option, currency));
  return [mapShippingOption(source, currency)];
}

function mapShippingOption(source: JsonObject, defaultCurrency: string): ShippingOption {
  const optionCurrency = readString(source, ['currency', 'Currency', 'currencyCode', 'CurrencyCode'], defaultCurrency).toUpperCase();
  const option: ShippingOption = {
    carrier: readString(source, ['carrier', 'Carrier', 'logisticsName', 'LogisticsName', 'ShippingMethod', 'shippingMethod', 'shippingName', 'shippingname', 'expressName', 'ExpressName', 'name'], 'Unknown'),
    service: readString(source, ['service', 'Service', 'serviceName', 'ServiceName', 'ShippingMethodName', 'shippingMethodName', 'shippingMethod', 'ShippingMethod', 'method', 'Method', 'shippingName', 'shippingname', 'logisticsName'], 'Product Shipping Estimate'),
    estimated_cost: readNumber(source, ['estimated_cost', 'estimatedCost', 'ShippingCost', 'shippingCost', 'shippingFee', 'freight', 'Freight', 'freightAmount', 'price', 'Price', 'cost', 'Cost', 'fee', 'Fee', 'amount', 'Amount']),
    currency: optionCurrency,
    estimated_days: readString(source, ['estimated_days', 'estimatedDays', 'DeliveryCycle', 'deliveryCycle', 'deliveryTime', 'deliverytime', 'timeLimit', 'days'], 'unknown')
  };

  setIfDefined(option, 'shipping_method', readOptionalString(source, ['shipping_method', 'shippingMethod', 'ShippingMethod']));
  setIfDefined(option, 'shipping_method_code', readOptionalString(source, ['shipping_method_code', 'shippingMethodCode', 'ShippingMethodCode']));
  setIfDefined(option, 'shipping_method_name', readOptionalString(source, ['shipping_method_name', 'shippingMethodName', 'ShippingMethodName']));
  setIfDefined(option, 'shipping_agent_id', readOptionalInteger(source, ['shipping_agent_id', 'shippingAgentId', 'ShippingAgentID']));
  setIfDefined(option, 'selected', readOptionalBoolean(source, ['selected', 'Selected']));
  setIfDefined(option, 'shipping_cost', readOptionalNumber(source, ['shipping_cost', 'shippingCost', 'ShippingCost']));
  setIfDefined(option, 'shipping_cost_format', readOptionalString(source, ['shipping_cost_format', 'shippingCostFormat', 'ShippingCostFormat']));
  setIfDefined(option, 'delivery_cycle', readOptionalString(source, ['delivery_cycle', 'deliveryCycle', 'DeliveryCycle']));
  setIfDefined(option, 'compute_weight', readOptionalNumber(source, ['compute_weight', 'computeWeight', 'ComputeWeight']));
  setIfDefined(option, 'freight_fee', readOptionalNumber(source, ['freight_fee', 'freightFee', 'FreightFee']));
  setIfDefined(option, 'freight_fee_format', readOptionalString(source, ['freight_fee_format', 'freightFeeFormat', 'FreightFeeFormat']));
  setIfDefined(option, 'logo', readOptionalString(source, ['logo', 'Logo']));
  setIfDefined(option, 'shipping_type', readOptionalInteger(source, ['shipping_type', 'shippingType', 'ShippingType']));
  setIfDefined(option, 'mobile_img_host', readOptionalNullableString(source, ['mobile_img_host', 'mobileImgHost', 'MobileImgHost']));
  setIfDefined(option, 'tariff', readOptionalNumber(source, ['tariff', 'Tariff']));
  setIfDefined(option, 'original_shipping_cost', readOptionalNumber(source, ['original_shipping_cost', 'originalShippingCost', 'OriginalShippingCost']));
  setIfDefined(option, 'original_shipping_cost_format', readOptionalString(source, ['original_shipping_cost_format', 'originalShippingCostFormat', 'OriginalShippingCostFormat']));

  return option;
}

function mapCurrencyDetails(source: JsonObject): ShippingCurrencyDetails | undefined {
  const currencySource = firstObject(source, ['currency_details', 'currencyDetails', 'Currency', 'currency']);
  if (!currencySource) return undefined;

  const code = readString(currencySource, ['code', 'currencyCode', 'CurrencyCode'], 'USD').toUpperCase();
  const details: ShippingCurrencyDetails = { code };
  setIfDefined(details, 'name', readOptionalString(currencySource, ['name', 'currencyName', 'CurrencyName']));
  setIfDefined(details, 'format_string', readOptionalString(currencySource, ['format_string', 'formatString', 'FormatString']));
  setIfDefined(details, 'format2_string', readOptionalString(currencySource, ['format2_string', 'format2String', 'Format2String']));
  setIfDefined(details, 'format3_string', readOptionalString(currencySource, ['format3_string', 'format3String', 'Format3String']));
  setIfDefined(details, 'symbol', readOptionalString(currencySource, ['symbol', 'Symbol']));
  setIfDefined(details, 'symbol2', readOptionalString(currencySource, ['symbol2', 'Symbol2']));
  setIfDefined(details, 'symbol3', readOptionalString(currencySource, ['symbol3', 'Symbol3']));
  return details;
}

function readOptionalString(source: JsonObject, keys: string[]): string | undefined {
  const value = readString(source, keys);
  return value || undefined;
}

function readOptionalNullableString(source: JsonObject, keys: string[]): string | null | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === null) return null;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readOptionalNumber(source: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readOptionalInteger(source: JsonObject, keys: string[]): number | undefined {
  const value = readOptionalNumber(source, keys);
  return value === undefined ? undefined : Math.trunc(value);
}

function readOptionalBoolean(source: JsonObject, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }
  }
  return undefined;
}

function setIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}
