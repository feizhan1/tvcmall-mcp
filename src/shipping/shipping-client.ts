import type { StoredAuthSession } from '../storage/token-store.js';

export interface ShippingEstimateInput {
  sku: string;
  quantity: number;
  countrycode: string;
}

export interface ShippingCurrencyDetails {
  code: string;
  name?: string;
  format_string?: string;
  format2_string?: string;
  format3_string?: string;
  symbol?: string;
  symbol2?: string;
  symbol3?: string;
}

export interface ShippingOption {
  carrier: string;
  service: string;
  estimated_cost: number;
  currency: string;
  estimated_days: string;
  shipping_method?: string;
  shipping_method_code?: string;
  shipping_method_name?: string;
  shipping_agent_id?: number;
  selected?: boolean;
  shipping_cost?: number;
  shipping_cost_format?: string;
  delivery_cycle?: string;
  compute_weight?: number;
  freight_fee?: number;
  freight_fee_format?: string;
  logo?: string;
  shipping_type?: number;
  mobile_img_host?: string | null;
  tariff?: number;
  original_shipping_cost?: number;
  original_shipping_cost_format?: string;
}

export interface ShippingEstimateResult {
  destination_country: string;
  country_name?: string;
  currency: string;
  currency_details?: ShippingCurrencyDetails;
  chargeable_weight_kg: number;
  display_weight?: number;
  display_volume_weight?: number;
  weight?: number;
  volume_weight?: number;
  item_count: number;
  param_country_code?: string;
  client_country_code?: string;
  gross_weight?: number;
  gross_volume_weight?: number;
  options: ShippingOption[];
}

export interface ShippingClient {
  estimateShipping(input: ShippingEstimateInput, session: StoredAuthSession): Promise<ShippingEstimateResult>;
}
