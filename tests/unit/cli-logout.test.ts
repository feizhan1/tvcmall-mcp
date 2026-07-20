import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import type { AuthClient, AuthProfile } from '../../src/auth/auth-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}
  public cleared = false;

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.cleared = true;
    this.session = null;
  }
}

class RecordingAuthClient implements AuthClient {
  public loggedOutSession: StoredAuthSession | null = null;

  async login(): Promise<StoredAuthSession> {
    throw new Error('not used');
  }

  async refresh(session: StoredAuthSession): Promise<StoredAuthSession> {
    return session;
  }

  async logout(session: StoredAuthSession): Promise<void> {
    this.loggedOutSession = session;
  }

  async me(session: StoredAuthSession): Promise<AuthProfile> {
    return { customer: session.customer, scopes: session.scopes };
  }
}

class StringOutput {
  public value = '';

  write(chunk: string): void {
    this.value += chunk;
  }
}

const session: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['profile:read'],
  accessToken: 'fake-access-token-value',
  refreshToken: 'fake-refresh-token-value',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('logout command', () => {
  it('calls auth logout before clearing the local session and does not print token values', async () => {
    const tokenStore = new MemoryTokenStore(session);
    const authClient = new RecordingAuthClient();
    const stdout = new StringOutput();

    await runCli(['logout'], {
      tokenStore,
      authClient,
      stdout,
      env: { TVCMALL_WEBAPI_BASE_URL: 'https://webapi.test' }
    });

    expect(authClient.loggedOutSession).toEqual(session);
    expect(tokenStore.cleared).toBe(true);
    expect(tokenStore.session).toBeNull();
    expect(stdout.value).toContain('已清除本地 TVCMall MCP 登录状态');
    expect(stdout.value).toContain('请从 MCP Client 的远程 MCP 配置中移除 Authorization: Bearer PAT');
    expect(stdout.value).not.toContain('fake-access-token-value');
    expect(stdout.value).not.toContain('fake-refresh-token-value');
  });
});
