import type { StoredAuthSession } from '../storage/token-store.js';

export interface ShippingEstimateItem {
  product_id: string;
  quantity: number;
}

export interface ShippingEstimateInput {
  destination_country: string;
  items: ShippingEstimateItem[];
}

export interface ShippingOption {
  carrier: string;
  service: string;
  estimated_cost: number;
  currency: 'USD';
  estimated_days: string;
}

export interface ShippingEstimateResult {
  destination_country: string;
  currency: 'USD';
  chargeable_weight_kg: number;
  item_count: number;
  options: ShippingOption[];
}

export interface ShippingClient {
  estimateShipping(input: ShippingEstimateInput, session: StoredAuthSession): Promise<ShippingEstimateResult>;
}
