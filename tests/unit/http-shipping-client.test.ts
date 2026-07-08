import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HttpShippingClient } from '../../src/shipping/http-shipping-client.js';
import type { ShippingEstimateInput } from '../../src/shipping/shipping-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'cus_100', email: 'buyer@example.com' },
  scopes: ['shipping:estimate'],
  accessToken: 'login-access-token',
  tokenType: 'Bearer'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function sampleResponse(name: string): Response {
  return new Response(readFileSync(new URL(`../../docs/external/api-responses/${name}`, import.meta.url), 'utf8'), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpShippingClient', () => {
  it('computes product destination shipping with sku body query and login token Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        countrycode: 'AO',
        quantity: 1,
        chargeableWeight: '0.3',
        logistics: [
          {
            shippingname: 'DHL',
            method: 'Express Worldwide',
            freight: '18.60',
            deliverytime: '7-12 days'
          }
        ]
      }
    }));
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.estimateShipping({
      sku: '684000085E',
      quantity: 1,
      countrycode: 'AO'
    }, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.tvcmall.test/v3/productdetail/shipping/compute');
    expect(JSON.parse(parsedUrl.searchParams.get('body') ?? '')).toEqual({
      sku: '684000085E',
      quantity: 1,
      countrycode: 'AO'
    });
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'login-access-token' });
    expect(result).toEqual({
      destination_country: 'AO',
      currency: 'USD',
      chargeable_weight_kg: 0.3,
      item_count: 1,
      options: [
        {
          carrier: 'DHL',
          service: 'Express Worldwide',
          estimated_cost: 18.6,
          currency: 'USD',
          estimated_days: '7-12 days'
        }
      ]
    });
  });

  it('maps the real product shipping API response fields completely', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        ShippingMethods: [
          {
            ShippingMethod: 'China Post',
            ShippingMethodCode: 'CNP',
            ShippingMethodName: 'China Post',
            ShippingAgentID: 66,
            Selected: true,
            ShippingCost: 3.54,
            ShippingCostFormat: '$3.54',
            DeliveryCycle: '15-35 business days',
            ComputeWeight: 0.0447046875,
            FreightFee: 0.0,
            FreightFeeFormat: '$0.00',
            Logo: '/images/shippingmethods/CNP.jpg',
            ShippingType: 1,
            MobileImgHost: null,
            Tariff: 0.0,
            OriginalShippingCost: 3.54,
            OriginalShippingCostFormat: '$3.54'
          },
          {
            ShippingMethod: 'DHL',
            ShippingMethodCode: 'DHL',
            ShippingMethodName: 'DHL',
            ShippingAgentID: 93,
            Selected: false,
            ShippingCost: 97.53,
            ShippingCostFormat: '$97.53',
            DeliveryCycle: '7-10 business days',
            ComputeWeight: 0.075103875,
            FreightFee: 0.0,
            FreightFeeFormat: '$0.00',
            Logo: '/images/shippingmethods/DHL.jpg',
            ShippingType: 0,
            MobileImgHost: null,
            Tariff: 0.0,
            OriginalShippingCost: 97.53,
            OriginalShippingCostFormat: '$97.53'
          }
        ],
        DisplayWeight: 0.017,
        DisplayVolumeWeight: 0.052,
        Weight: 0.015,
        VolumeWeight: 0.047,
        Currency: {
          CurrencyCode: 'USD',
          CurrencyName: 'USD',
          FormatString: '${0:N2}',
          Format2String: 'USD{0:0.00}',
          Format3String: 'USD-${0:0.00}',
          Symbol: '$ - USD',
          Symbol2: 'USD',
          Symbol3: 'USD - $'
        },
        CountryCode: 'AO',
        CountryName: 'Angola',
        ParamCountryCode: 'AO',
        ClientCountryCode: 'AO',
        GrossWeight: 0.0,
        GrossVolumeWeight: 0.0
      }
    }));
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.estimateShipping({
      sku: '684000085E',
      quantity: 1,
      countrycode: 'AO'
    }, session);

    expect(result).toMatchObject({
      destination_country: 'AO',
      country_name: 'Angola',
      currency: 'USD',
      currency_details: {
        code: 'USD',
        name: 'USD',
        format_string: '${0:N2}',
        format2_string: 'USD{0:0.00}',
        format3_string: 'USD-${0:0.00}',
        symbol: '$ - USD',
        symbol2: 'USD',
        symbol3: 'USD - $'
      },
      chargeable_weight_kg: 0.017,
      display_weight: 0.017,
      display_volume_weight: 0.052,
      weight: 0.015,
      volume_weight: 0.047,
      item_count: 1,
      param_country_code: 'AO',
      client_country_code: 'AO',
      gross_weight: 0,
      gross_volume_weight: 0
    });
    expect(result.options).toEqual([
      {
        carrier: 'China Post',
        service: 'China Post',
        estimated_cost: 3.54,
        currency: 'USD',
        estimated_days: '15-35 business days',
        shipping_method: 'China Post',
        shipping_method_code: 'CNP',
        shipping_method_name: 'China Post',
        shipping_agent_id: 66,
        selected: true,
        shipping_cost: 3.54,
        shipping_cost_format: '$3.54',
        delivery_cycle: '15-35 business days',
        compute_weight: 0.0447046875,
        freight_fee: 0,
        freight_fee_format: '$0.00',
        logo: '/images/shippingmethods/CNP.jpg',
        shipping_type: 1,
        mobile_img_host: null,
        tariff: 0,
        original_shipping_cost: 3.54,
        original_shipping_cost_format: '$3.54'
      },
      {
        carrier: 'DHL',
        service: 'DHL',
        estimated_cost: 97.53,
        currency: 'USD',
        estimated_days: '7-10 business days',
        shipping_method: 'DHL',
        shipping_method_code: 'DHL',
        shipping_method_name: 'DHL',
        shipping_agent_id: 93,
        selected: false,
        shipping_cost: 97.53,
        shipping_cost_format: '$97.53',
        delivery_cycle: '7-10 business days',
        compute_weight: 0.075103875,
        freight_fee: 0,
        freight_fee_format: '$0.00',
        logo: '/images/shippingmethods/DHL.jpg',
        shipping_type: 0,
        mobile_img_host: null,
        tariff: 0,
        original_shipping_cost: 97.53,
        original_shipping_cost_format: '$97.53'
      }
    ]);
  });

  it('maps the real product shipping response sample file', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('按照商品sku和目的地估算运费api.json'));
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test/', fetch: fetchMock });

    const result = await client.estimateShipping({
      sku: '684000085E',
      quantity: 1,
      countrycode: 'AO'
    }, session);

    expect(result).toMatchObject({
      destination_country: 'AO',
      country_name: 'Angola',
      currency: 'USD',
      chargeable_weight_kg: 0.017,
      display_weight: 0.017,
      display_volume_weight: 0.052,
      weight: 0.015,
      volume_weight: 0.047
    });
    expect(result.options).toHaveLength(5);
    expect(result.options[0]).toMatchObject({
      carrier: 'China Post',
      shipping_method_code: 'CNP',
      shipping_cost: 3.54,
      delivery_cycle: '15-35 business days'
    });
  });

  it('requires a sku because the real product shipping API is sku based', async () => {
    const fetchMock = vi.fn();
    const client = new HttpShippingClient({ baseUrl: 'https://api.tvcmall.test', fetch: fetchMock });

    const inputWithoutSku = { quantity: 1, countrycode: 'US' } as unknown as ShippingEstimateInput;

    await expect(client.estimateShipping(inputWithoutSku, session)).rejects.toThrow('sku');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
