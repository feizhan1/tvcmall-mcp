import type { AuthClient } from './auth-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

export const FAKE_AUTH_SCOPES = [
  'profile:read',
  'products:read',
  'shipping:estimate',
  'orders:read',
  'tracking:read',
  'orders:export'
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
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 60 * 1000);

    return {
      customer: {
        id: 'fake_cus_001',
        email: 'fake.customer@example.com',
        name: 'Fake TVCMall Customer'
      },
      scopes: [...FAKE_AUTH_SCOPES],
      accessToken: 'fake-access-token-for-local-development-only',
      refreshToken: 'fake-refresh-token-for-local-development-only',
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString()
    };
  }
}
