import { describe, expect, it, vi } from 'vitest';
import { EstimateShippingInputSchema, estimateShippingForMcp } from '../../src/tools/shipping.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['shipping:estimate'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};
const input = { sku: 'TVC-IP15-CASE-CLEAR', quantity: 10, countrycode: 'US' };

describe('estimateShippingForMcp', () => {
  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await estimateShippingForMcp(input, { shippingClient: new FakeShippingClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns shipping options without short-lived token values', async () => {
    const result = await estimateShippingForMcp(input, { authContext, shippingClient: new FakeShippingClient() });
    expect(result.structuredContent).toMatchObject({ destination_country: 'US', currency: 'USD', options: expect.any(Array) });
    expect(JSON.stringify(result)).not.toContain('short-lived-token');
  });

  it('does not call shipping client when shipping:estimate is absent', async () => {
    const shippingClient = new FakeShippingClient();
    const estimateShipping = vi.spyOn(shippingClient, 'estimateShipping');
    const result = await estimateShippingForMcp(input, { authContext: { ...authContext, scopes: [] }, shippingClient });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(estimateShipping).not.toHaveBeenCalled();
  });

  it('accepts product shipping input and rejects order_id only input', () => {
    expect(EstimateShippingInputSchema.parse({ sku: '684000085E', quantity: 1, countrycode: 'AO' })).toEqual({ sku: '684000085E', quantity: 1, countrycode: 'AO' });
    expect(() => EstimateShippingInputSchema.parse({ order_id: 'V24011000008' })).toThrow('sku');
  });
});
