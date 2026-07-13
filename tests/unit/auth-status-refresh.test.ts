import { describe, expect, it } from 'vitest';
import { getAuthStatus } from '../../src/tools/auth-status.js';

describe('getAuthStatus request-scoped behavior', () => {
  it('reports the verified request identity without attempting local token refresh', () => {
    expect(getAuthStatus({
      customerId: 'customer_123',
      displayName: 'TVCMall Buyer',
      scopes: ['profile:read'],
      upstreamAccessToken: 'short-lived-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      apiKeyFingerprint: 'fingerprint'
    })).toEqual({
      logged_in: true,
      display_name: 'TVCMall Buyer',
      scopes: ['profile:read']
    });
  });
});
