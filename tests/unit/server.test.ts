import { describe, expect, it } from 'vitest';
import { createTvcMallMcpServer } from '../../src/server.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class FakeTokenStore implements TokenStore {
  async getSession(): Promise<StoredAuthSession | null> {
    return null;
  }

  async saveSession(): Promise<void> {}

  async clearSession(): Promise<void> {}
}

describe('createTvcMallMcpServer', () => {
  it('registers the tvcmall_auth_status tool before connecting a transport', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(registeredTools)).toContain('tvcmall_auth_status');
  });
});
