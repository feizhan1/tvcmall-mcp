import { describe, expect, it } from 'vitest';
import { getAuthStatus } from '../../src/tools/auth-status.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class FakeTokenStore implements TokenStore {
  constructor(private readonly session: StoredAuthSession | null) {}

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(): Promise<void> {}

  async clearSession(): Promise<void> {}
}

describe('getAuthStatus', () => {
  it('returns logged_out status when no token session exists', async () => {
    const status = await getAuthStatus(new FakeTokenStore(null));

    expect(status).toEqual({
      logged_in: false,
      scopes: []
    });
  });

  it('returns customer identity and scopes without exposing tokens', async () => {
    const status = await getAuthStatus(
      new FakeTokenStore({
        customer: {
          id: 'cus_123',
          email: 'buyer@example.com',
          name: 'Buyer'
        },
        scopes: ['products:read', 'orders:read'],
        accessToken: 'access-secret-token',
        refreshToken: 'refresh-secret-token',
        tokenType: 'Bearer',
        expiresAt: '2026-07-07T12:00:00.000Z'
      })
    );

    expect(status).toEqual({
      logged_in: true,
      customer_email: 'buyer@example.com',
      scopes: ['products:read', 'orders:read']
    });
    expect(JSON.stringify(status)).not.toContain('access-secret-token');
    expect(JSON.stringify(status)).not.toContain('refresh-secret-token');
  });
});
