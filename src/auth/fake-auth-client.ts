import type { AuthClient, AuthProfile } from './auth-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

export const FAKE_AUTH_SCOPES = [
  'profile:read',
  'products:read',
  'shipping:estimate',
  'orders:read',
  'tracking:read'
] as const;

export interface FakeAuthClientOptions {
  now?: () => Date;
}

export class FakeAuthClient implements AuthClient {
  private readonly now: () => Date;

  constructor(options: FakeAuthClientOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async login(): Promise<StoredAuthSession> {
    return this.createSession();
  }

  async refresh(session: StoredAuthSession): Promise<StoredAuthSession> {
    if (!session.refreshToken) {
      throw new Error('Missing refresh token for fake auth refresh');
    }

    return this.createSession({
      refreshToken: session.refreshToken,
      customer: session.customer,
      scopes: session.scopes
    });
  }

  async logout(_session: StoredAuthSession): Promise<void> {}

  async me(session: StoredAuthSession): Promise<AuthProfile> {
    return {
      customer: session.customer,
      scopes: [...session.scopes]
    };
  }

  private createSession(overrides: Partial<StoredAuthSession> = {}): StoredAuthSession {
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 60 * 1000);
    const issuedAtToken = issuedAt.toISOString().replace(/[-:.TZ]/g, '');

    return {
      customer: overrides.customer ?? {
        id: 'fake_cus_001',
        email: 'fake.customer@example.com',
        name: 'Fake TVCMall Customer'
      },
      scopes: overrides.scopes ? [...overrides.scopes] : [...FAKE_AUTH_SCOPES],
      accessToken: `fake-access-token-${issuedAtToken}-for-local-development-only`,
      refreshToken: overrides.refreshToken ?? `fake-refresh-token-${issuedAtToken}-for-local-development-only`,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString()
    };
  }
}
