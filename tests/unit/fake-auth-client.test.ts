import { describe, expect, it } from 'vitest';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const baseTime = new Date('2026-07-07T10:00:00.000Z');

describe('FakeAuthClient', () => {
  it('refreshes an existing fake session with a new access token and expiry', async () => {
    let now = baseTime;
    const client = new FakeAuthClient({ now: () => now });
    const session = await client.login();
    now = new Date('2026-07-07T11:00:00.000Z');

    const refreshed = await client.refresh(session);

    expect(refreshed.customer).toEqual(session.customer);
    expect(refreshed.scopes).toEqual(session.scopes);
    expect(refreshed.refreshToken).toBe(session.refreshToken);
    expect(refreshed.accessToken).not.toBe(session.accessToken);
    expect(refreshed.expiresAt).toBe('2026-07-07T13:00:00.000Z');
  });

  it('returns fake profile data from me', async () => {
    const client = new FakeAuthClient({ now: () => baseTime });
    const session = await client.login();

    const profile = await client.me(session);

    expect(profile).toEqual({
      customer: session.customer,
      scopes: session.scopes
    });
  });

  it('rejects refresh when no refresh token exists', async () => {
    const client = new FakeAuthClient({ now: () => baseTime });
    const session: StoredAuthSession = {
      customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
      scopes: []
    };

    await expect(client.refresh(session)).rejects.toThrow('refresh token');
  });

  it('accepts logout as an idempotent fake operation', async () => {
    const client = new FakeAuthClient({ now: () => baseTime });
    const session = await client.login();

    await expect(client.logout(session)).resolves.toBeUndefined();
  });
});
