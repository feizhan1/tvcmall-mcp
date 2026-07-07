import { Command } from 'commander';
import { formatWhoami } from './messages.js';
import { startMcpServer } from '../server.js';
import { getAuthStatus } from '../tools/auth-status.js';
import type { TokenStore } from '../storage/token-store.js';
import { createDefaultTokenStore } from '../storage/token-store.js';
import { PACKAGE_VERSION } from '../version.js';
import type { AuthClient } from '../auth/auth-client.js';
import { FakeAuthClient } from '../auth/fake-auth-client.js';

export interface CliOutput {
  write(chunk: string): unknown;
}

export interface CliOptions {
  tokenStore?: TokenStore;
  authClient?: AuthClient;
  stdout?: CliOutput;
  stderr?: CliOutput;
}

export function createCli(options: CliOptions = {}): Command {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
  const authClient = options.authClient ?? new FakeAuthClient();
  const stdout = options.stdout ?? process.stdout;
  const program = new Command();

  program
    .name('@tvcmall/mcp')
    .description('TVCMall Customer MCP local server and account CLI')
    .version(PACKAGE_VERSION);

  program
    .command('server')
    .description('启动 TVCMall MCP stdio server')
    .action(async () => {
      await startMcpServer({ tokenStore, authClient });
    });

  program
    .command('whoami')
    .description('展示当前登录账号和权限范围')
    .action(async () => {
      stdout.write(`${formatWhoami(await getAuthStatus(tokenStore, { authClient }))}\n`);
    });

  program
    .command('login')
    .description('使用假数据登录 TVCMall MCP，本地保存 fake token session')
    .action(async () => {
      const session = await authClient.login();
      await tokenStore.saveSession(session);
      stdout.write(
        [
          '已使用假数据登录 TVCMall MCP。',
          `当前账号：${session.customer.email}`,
          `权限范围：${session.scopes.join(', ')}`,
          '注意：当前为本地开发 fake token，后续会替换为真实 /api/mcp/auth/login。'
        ].join('\n') + '\n'
      );
    });

  program
    .command('logout')
    .description('清除本地登录状态')
    .action(async () => {
      const session = await tokenStore.getSession();
      if (session) {
        await authClient.logout(session);
      }
      await tokenStore.clearSession();
      stdout.write('已清除本地 TVCMall MCP 登录状态。\n');
    });

  program
    .command('install')
    .description('安装 MCP Client 配置')
    .argument('<client>', 'claude, cursor, or codex')
    .action((client: string) => {
      stdout.write(`install ${client} 命令已预留，后续会写入对应 MCP Client 配置。\n`);
    });

  return program;
}

export async function runCli(argv: string[], options: CliOptions = {}): Promise<void> {
  await createCli(options).parseAsync(argv, { from: 'user' });
}
