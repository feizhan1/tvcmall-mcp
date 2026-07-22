import { describe, expect, it } from 'vitest';
import { createCli, runCli } from '../../src/cli/app.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

const testEnv = {
  TVCMALL_WEBAPI_BASE_URL: 'https://webapi.test',
  TVCMALL_DATA_SOURCE: 'fake'
};

const legacySession: StoredAuthSession = {
  customer: { id: 'legacy_cus_001', email: 'legacy.customer@example.com' },
  scopes: ['profile:read'],
  accessToken: 'legacy-access-token-value',
  refreshToken: 'legacy-refresh-token-value',
  tokenType: 'Bearer',
  expiresAt: '2026-07-08T06:00:00.000Z'
};

class MemoryTokenStore implements TokenStore {
  public saveCalls = 0;

  constructor(public session: StoredAuthSession | null = null) {}

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.saveCalls += 1;
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.session = null;
  }
}

class RecordingAuthClient {
  public loginCalls = 0;

  async login(): Promise<StoredAuthSession> {
    this.loginCalls += 1;
    return legacySession;
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

describe('CLI PAT configuration guidance', () => {
  it('removes credential options and describes login as remote PAT guidance', () => {
    const program = createCli({
      tokenStore: new MemoryTokenStore(),
      authClient: new RecordingAuthClient(),
      stdout: new StringOutput(),
      env: testEnv
    });

    const loginCommand = program.commands.find((command) => command.name() === 'login');
    const optionNames = loginCommand?.options.map((option) => option.long) ?? [];

    expect(loginCommand?.description()).toBe('查看远程 MCP PAT 配置说明');
    expect(optionNames).not.toContain('--email');
    expect(optionNames).not.toContain('--password');
    expect(optionNames).not.toContain('--no-rememberme');
  });

  it('prints only remote PAT guidance without invoking legacy login or saving a session', async () => {
    const tokenStore = new MemoryTokenStore();
    const authClient = new RecordingAuthClient();
    const stdout = new StringOutput();

    await runCli(['login'], { tokenStore, authClient, stdout, env: testEnv });

    expect(authClient.loginCalls).toBe(0);
    expect(tokenStore.saveCalls).toBe(0);
    expect(tokenStore.session).toBeNull();
    expect(stdout.value).toBe([
      '请在 MCP Client 的远程 MCP 配置中设置以下请求头：',
      'TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}',
      '本地 login 命令不会读取或验证 PAT；最终有效性和权限以业务 WebApi 调用结果为准。',
      ''
    ].join('\n'));
    expect(stdout.value).not.toContain(legacySession.customer.email);
    expect(stdout.value).not.toContain(legacySession.scopes[0]);
    expect(stdout.value).not.toContain(legacySession.accessToken);
    expect(stdout.value).not.toContain(legacySession.refreshToken);
  });

  it('explains the remote PAT configuration boundary without exposing a legacy local session', async () => {
    const tokenStore = new MemoryTokenStore(legacySession);
    const stdout = new StringOutput();

    await runCli(['whoami'], { tokenStore, stdout, env: testEnv });

    expect(stdout.value).toContain('本地 CLI 无法读取或判断远程 MCP 会话的 PAT 配置状态');
    expect(stdout.value).toContain('TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}');
    expect(stdout.value).not.toContain('Authorization: Bearer tmcp_v1_');
    expect(stdout.value).not.toContain('当前未登录 TVCMall');
    expect(stdout.value).not.toContain('已登录 TVCMall MCP');
    expect(stdout.value).not.toContain('当前账号');
    expect(stdout.value).not.toContain('权限范围');
    expect(stdout.value).not.toContain(legacySession.customer.email);
    expect(stdout.value).not.toContain('profile:read');
    expect(stdout.value).not.toContain(legacySession.accessToken);
    expect(stdout.value).not.toContain(legacySession.refreshToken);
  });

  it('describes whoami as remote MCP PAT guidance', () => {
    const program = createCli({
      tokenStore: new MemoryTokenStore(),
      authClient: new RecordingAuthClient(),
      stdout: new StringOutput(),
      env: testEnv
    });

    const whoamiCommand = program.commands.find((command) => command.name() === 'whoami');

    expect(whoamiCommand?.description()).toBe('查看远程 MCP PAT 配置说明');
  });

});
