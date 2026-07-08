import type { ShippingClient, ShippingEstimateInput, ShippingEstimateResult } from './shipping-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

export class FakeShippingClient implements ShippingClient {
  async estimateShipping(input: ShippingEstimateInput, _session: StoredAuthSession): Promise<ShippingEstimateResult> {
    const itemCount = input.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1;
    const chargeableWeight = Math.max(0.5, Number((itemCount * 0.1).toFixed(2)));
    const destinationCountry = (input.destination_country ?? 'US').toUpperCase();
    const countryFactor = destinationCountry === 'US' ? 1 : 1.25;

    return {
      destination_country: destinationCountry,
      currency: 'USD',
      chargeable_weight_kg: chargeableWeight,
      item_count: itemCount,
      options: [
        {
          carrier: 'DHL',
          service: 'Express Worldwide',
          estimated_cost: Number((18 + chargeableWeight * 6 * countryFactor).toFixed(2)),
          currency: 'USD',
          estimated_days: '3-5 business days'
        },
        {
          carrier: 'Standard Air',
          service: 'Economy Packet',
          estimated_cost: Number((8 + chargeableWeight * 3.5 * countryFactor).toFixed(2)),
          currency: 'USD',
          estimated_days: '7-12 business days'
        }
      ]
    };
  }
}
