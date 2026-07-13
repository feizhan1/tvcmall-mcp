import { describe, expect, it } from 'vitest';
import { getAuthStatus } from '../../src/tools/auth-status.js';

describe('getAuthStatus', () => {
  it('returns disconnected status when request auth context is missing', () => {
    expect(getAuthStatus()).toEqual({ logged_in: false, scopes: [] });
  });

  it('returns display name and scopes without exposing the short-lived token or expiry', () => {
    const status = getAuthStatus({
      customerId: 'cus_123',
      displayName: 'Buyer',
      scopes: ['products:read', 'orders:read'],
      upstreamAccessToken: 'access-secret-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      apiKeyFingerprint: 'fingerprint'
    });

    expect(status).toEqual({
      logged_in: true,
      display_name: 'Buyer',
      scopes: ['products:read', 'orders:read']
    });
    expect(JSON.stringify(status)).not.toContain('access-secret-token');
    expect(JSON.stringify(status)).not.toContain('2030-01-01T00:00:00.000Z');
  });
});
