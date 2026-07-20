import { describe, expect, it } from 'vitest';
import { createCli, runCli } from '../../src/cli/app.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

const testEnv = {
  TVCMALL_API_KEY_VERIFY_URL: 'https://auth.test/verify',
  TVCMALL_WEBAPI_BASE_URL: 'https://webapi.test'
};

class MemoryTokenStore implements TokenStore {
  public session: StoredAuthSession | null = null;

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.session = null;
  }
}



class CapturingRealAuthClient {
  public loginInput: unknown = null;

  async login(input?: unknown): Promise<StoredAuthSession> {
    this.loginInput = input;
    return {
      customer: { id: 'cus_100', email: 'buyer@example.com', name: 'Buyer Account' },
      scopes: ['products:read', 'orders:read'],
      accessToken: 'real-access-token',
      refreshToken: 'real-refresh-token',
      tokenType: 'Bearer',
      expiresAt: '2026-07-08T06:00:00.000Z'
    };
  }

  async refresh(session: StoredAuthSession): Promise<StoredAuthSession> {
    return session;
  }

  async logout(): Promise<void> {}

  async me(session: StoredAuthSession) {
    return { customer: session.customer, scopes: session.scopes };
  }
}

class StringOutput {
  public value = '';

  write(chunk: string): void {
    this.value += chunk;
  }
}

describe('login command with fake data', () => {
  it('saves a fake auth session without printing token values', async () => {
    const tokenStore = new MemoryTokenStore();
    const stdout = new StringOutput();

    await runCli(['login'], { tokenStore, stdout, env: { ...testEnv, TVCMALL_DATA_SOURCE: 'fake' } });

    expect(tokenStore.session).toMatchObject({
      customer: {
        id: 'fake_cus_001',
        email: 'fake.customer@example.com',
        name: 'Fake TVCMall Customer'
      },
      scopes: ['profile:read', 'products:read', 'shipping:estimate', 'orders:read', 'tracking:read', 'orders:export'],
      tokenType: 'Bearer'
    });
    expect(tokenStore.session?.accessToken).toBeTruthy();
    expect(tokenStore.session?.refreshToken).toBeTruthy();
    expect(stdout.value).toContain('已使用假数据登录 TVCMall MCP');
    expect(stdout.value).toContain('fake.customer@example.com');
    expect(stdout.value).not.toContain(tokenStore.session?.accessToken ?? 'missing-access-token');
    expect(stdout.value).not.toContain(tokenStore.session?.refreshToken ?? 'missing-refresh-token');
  });

  it('explains the remote PAT configuration boundary without exposing the fake local session', async () => {
    const tokenStore = new MemoryTokenStore();
    const stdout = new StringOutput();

    await runCli(['login'], { tokenStore, stdout, env: { ...testEnv, TVCMALL_DATA_SOURCE: 'fake' } });
    stdout.value = '';
    await runCli(['whoami'], { tokenStore, stdout, env: { ...testEnv, TVCMALL_DATA_SOURCE: 'fake' } });

    expect(stdout.value).toContain('本地 CLI 无法读取或判断远程 MCP 会话的 PAT 配置状态');
    expect(stdout.value).toContain('Authorization: Bearer tmcp_v1_{tokenId}.{secret}');
    expect(stdout.value).not.toContain('当前未登录 TVCMall');
    expect(stdout.value).not.toContain('已登录 TVCMall MCP');
    expect(stdout.value).not.toContain('当前账号');
    expect(stdout.value).not.toContain('权限范围');
    expect(stdout.value).not.toContain('fake.customer@example.com');
    expect(stdout.value).not.toContain('profile:read');
    expect(stdout.value).not.toContain(tokenStore.session?.accessToken ?? 'missing-access-token');
    expect(stdout.value).not.toContain(tokenStore.session?.refreshToken ?? 'missing-refresh-token');
  });

  it('describes whoami as remote MCP PAT guidance', () => {
    const program = createCli({
      tokenStore: new MemoryTokenStore(),
      stdout: new StringOutput(),
      env: { ...testEnv, TVCMALL_DATA_SOURCE: 'fake' }
    });

    const whoamiCommand = program.commands.find((command) => command.name() === 'whoami');

    expect(whoamiCommand?.description()).toBe('查看远程 MCP PAT 配置说明');
  });

  it('passes explicit credentials to real auth login without printing secrets', async () => {
    const tokenStore = new MemoryTokenStore();
    const stdout = new StringOutput();
    const authClient = new CapturingRealAuthClient();

    await runCli(['login', '--email', 'buyer@example.com', '--password', 'secret-password'], {
      tokenStore,
      stdout,
      authClient,
      env: { ...testEnv, TVCMALL_DATA_SOURCE: 'real' }
    });

    expect(authClient.loginInput).toEqual({
      email: 'buyer@example.com',
      password: 'secret-password',
      rememberme: true
    });
    expect(tokenStore.session).toMatchObject({
      customer: { id: 'cus_100', email: 'buyer@example.com', name: 'Buyer Account' },
      tokenType: 'Bearer'
    });
    expect(stdout.value).toContain('已登录 TVCMall MCP');
    expect(stdout.value).toContain('buyer@example.com');
    expect(stdout.value).not.toContain('secret-password');
    expect(stdout.value).not.toContain('real-access-token');
    expect(stdout.value).not.toContain('real-refresh-token');
    expect(stdout.value).not.toContain('假数据');
  });

});
