import { describe, expect, it } from 'vitest';
import { KeychainTokenStore, resolveCredentialStoreAdapter, type CredentialStoreAdapter } from '../../src/storage/keychain-token-store.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

class MemoryCredentialAdapter implements CredentialStoreAdapter {
  private readonly values = new Map<string, string>();
  public failGet = false;

  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.failGet) {
      throw new Error('Keychain unavailable with secret-token-value');
    }
    return this.values.get(`${service}:${account}`) ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(`${service}:${account}`, password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(`${service}:${account}`);
  }

  async seed(service: string, account: string, value: string): Promise<void> {
    this.values.set(`${service}:${account}`, value);
  }
}

const sampleSession: StoredAuthSession = {
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
};

describe('KeychainTokenStore', () => {
  it('saves and reads an auth session through the credential adapter', async () => {
    const adapter = new MemoryCredentialAdapter();
    const store = new KeychainTokenStore({ adapter, serviceName: 'svc', accountName: 'acct' });

    await store.saveSession(sampleSession);

    await expect(store.getSession()).resolves.toEqual(sampleSession);
  });

  it('clears the stored auth session', async () => {
    const adapter = new MemoryCredentialAdapter();
    const store = new KeychainTokenStore({ adapter, serviceName: 'svc', accountName: 'acct' });

    await store.saveSession(sampleSession);
    await store.clearSession();

    await expect(store.getSession()).resolves.toBeNull();
  });

  it('returns null when no auth session exists', async () => {
    const adapter = new MemoryCredentialAdapter();
    const store = new KeychainTokenStore({ adapter, serviceName: 'svc', accountName: 'acct' });

    await expect(store.getSession()).resolves.toBeNull();
  });

  it('returns null for corrupted credential payloads', async () => {
    const adapter = new MemoryCredentialAdapter();
    const store = new KeychainTokenStore({ adapter, serviceName: 'svc', accountName: 'acct' });
    await adapter.seed('svc', 'acct', '{"accessToken":"secret-token-value",');

    await expect(store.getSession()).resolves.toBeNull();
  });

  it('returns null when the system credential store is unavailable', async () => {
    const adapter = new MemoryCredentialAdapter();
    adapter.failGet = true;
    const store = new KeychainTokenStore({ adapter, serviceName: 'svc', accountName: 'acct' });

    await expect(store.getSession()).resolves.toBeNull();
  });

  it('resolves keytar default export when imported as an ESM namespace object', async () => {
    const adapter = new MemoryCredentialAdapter();
    const namespaceLikeModule = {
      default: adapter,
      getPassword: adapter.getPassword.bind(adapter)
    };

    const resolved = resolveCredentialStoreAdapter(namespaceLikeModule);

    await resolved.setPassword('svc', 'acct', 'secret');
    await expect(resolved.getPassword('svc', 'acct')).resolves.toBe('secret');
  });

});
