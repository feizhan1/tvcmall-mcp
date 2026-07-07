import { describe, expect, it } from 'vitest';
import { getAuthStatus } from '../../src/tools/auth-status.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}
  public savedSession: StoredAuthSession | null = null;

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.savedSession = session;
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.session = null;
  }
}

describe('getAuthStatus refresh behavior', () => {
  it('refreshes expired sessions before returning logged-in status', async () => {
    const expiredSession: StoredAuthSession = {
      customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
      scopes: ['profile:read'],
      accessToken: 'expired-access-token',
      refreshToken: 'fake-refresh-token-for-local-development-only',
      tokenType: 'Bearer',
      expiresAt: '2026-07-07T09:00:00.000Z'
    };
    const tokenStore = new MemoryTokenStore(expiredSession);
    const authClient = new FakeAuthClient({ now: () => new Date('2026-07-07T10:00:00.000Z') });

    const status = await getAuthStatus(tokenStore, {
      authClient,
      now: () => new Date('2026-07-07T10:00:00.000Z')
    });

    expect(status).toEqual({
      logged_in: true,
      customer_email: 'fake.customer@example.com',
      scopes: ['profile:read']
    });
    expect(tokenStore.savedSession).not.toBeNull();
    expect(tokenStore.savedSession?.accessToken).not.toBe('expired-access-token');
  });
});
