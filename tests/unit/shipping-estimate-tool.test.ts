import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { EstimateShippingInputSchema, estimateShippingForMcp } from '../../src/tools/shipping.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);
const input = { sku: 'TVC-IP15-CASE-CLEAR', quantity: 10, countrycode: 'US' };

describe('estimateShippingForMcp', () => {
  it('returns PAT auth required when request auth context is missing', async () => {
    const result = await estimateShippingForMcp(input, { shippingClient: new FakeShippingClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns shipping options without PAT values', async () => {
    const result = await estimateShippingForMcp(input, { authContext, shippingClient: new FakeShippingClient() });
    expect(result.structuredContent).toMatchObject({ destination_country: 'US', currency: 'USD', options: expect.any(Array) });
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('calls the shipping client without a local scope list', async () => {
    const shippingClient = new FakeShippingClient();
    const estimateShipping = vi.spyOn(shippingClient, 'estimateShipping');
    const result = await estimateShippingForMcp(input, { authContext, shippingClient });
    expect(result.isError).toBeUndefined();
    expect(estimateShipping).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accessToken: pat, scopes: [] }));
  });

  it('accepts product shipping input and rejects order_id only input', () => {
    expect(EstimateShippingInputSchema.parse({ sku: '684000085E', quantity: 1, countrycode: 'AO' })).toEqual({ sku: '684000085E', quantity: 1, countrycode: 'AO' });
    expect(() => EstimateShippingInputSchema.parse({ order_id: 'V24011000008' })).toThrow('sku');
  });
});
