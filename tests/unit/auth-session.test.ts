import { describe, expect, it } from 'vitest';
import { getActiveSession } from '../../src/auth/session-manager.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}

  public savedSession: StoredAuthSession | null = null;
  public cleared = false;

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.savedSession = session;
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.cleared = true;
    this.session = null;
  }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['profile:read'],
  accessToken: 'active-access-token',
  refreshToken: 'fake-refresh-token-for-local-development-only',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('getActiveSession', () => {
  it('returns null when no session is stored', async () => {
    const tokenStore = new MemoryTokenStore(null);
    const client = new FakeAuthClient({ now: () => new Date('2026-07-07T10:00:00.000Z') });

    await expect(getActiveSession(tokenStore, { authClient: client, now: () => new Date('2026-07-07T10:00:00.000Z') })).resolves.toBeNull();
  });

  it('returns active sessions without refreshing', async () => {
    const tokenStore = new MemoryTokenStore(activeSession);
    const client = new FakeAuthClient({ now: () => new Date('2026-07-07T10:00:00.000Z') });

    const result = await getActiveSession(tokenStore, { authClient: client, now: () => new Date('2026-07-07T10:00:00.000Z') });

    expect(result).toBe(activeSession);
    expect(tokenStore.savedSession).toBeNull();
  });

  it('refreshes expired sessions and saves the refreshed session', async () => {
    const expiredSession = { ...activeSession, expiresAt: '2026-07-07T09:00:00.000Z' };
    const tokenStore = new MemoryTokenStore(expiredSession);
    const client = new FakeAuthClient({ now: () => new Date('2026-07-07T10:00:00.000Z') });

    const result = await getActiveSession(tokenStore, { authClient: client, now: () => new Date('2026-07-07T10:00:00.000Z') });

    expect(result?.accessToken).not.toBe(expiredSession.accessToken);
    expect(result?.expiresAt).toBe('2026-07-07T12:00:00.000Z');
    expect(tokenStore.savedSession).toEqual(result);
  });

  it('clears expired sessions when refresh fails', async () => {
    const expiredSession = {
      customer: activeSession.customer,
      scopes: activeSession.scopes,
      accessToken: activeSession.accessToken,
      expiresAt: '2026-07-07T09:00:00.000Z'
    };
    const tokenStore = new MemoryTokenStore(expiredSession);
    const client = new FakeAuthClient({ now: () => new Date('2026-07-07T10:00:00.000Z') });

    const result = await getActiveSession(tokenStore, { authClient: client, now: () => new Date('2026-07-07T10:00:00.000Z') });

    expect(result).toBeNull();
    expect(tokenStore.cleared).toBe(true);
  });
});
