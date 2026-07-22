import { Command } from 'commander';
import { formatWhoami } from './messages.js';
import { createTvcMallClients } from '../app/client-factory.js';
import type { AuthClient } from '../auth/auth-client.js';
import { loadRuntimeConfig, type TvcMallRuntimeConfig } from '../config/runtime-config.js';
import { startMcpServer } from '../server.js';
import type { TokenStore } from '../storage/token-store.js';
import { createDefaultTokenStore } from '../storage/token-store.js';
import { getAuthStatus } from '../tools/auth-status.js';
import { PACKAGE_VERSION } from '../version.js';

export interface CliOutput {
  write(chunk: string): unknown;
}

export interface CliOptions {
  tokenStore?: TokenStore;
  authClient?: AuthClient;
  stdout?: CliOutput;
  stderr?: CliOutput;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: TvcMallRuntimeConfig;
}

export function createCli(options: CliOptions = {}): Command {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
  const runtimeConfig = options.runtimeConfig ?? loadRuntimeConfig(options.env ?? process.env);
  const defaultClients = createTvcMallClients(runtimeConfig);
  const authClient = options.authClient ?? defaultClients.authClient;
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
    .description('查看远程 MCP PAT 配置说明')
    .action(async () => {
      stdout.write(`${formatWhoami(await getAuthStatus(tokenStore, { authClient }))}\n`);
    });

  program
    .command('login')
    .description('查看远程 MCP PAT 配置说明')
    .action(() => {
      stdout.write([
        '请在 MCP Client 的远程 MCP 配置中设置以下请求头：',
        'TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}',
        '本地 login 命令不会读取或验证 PAT；最终有效性和权限以业务 WebApi 调用结果为准。',
        ''
      ].join('\n'));
    });

  program
    .command('logout')
    .description('清除历史本地登录状态并说明如何移除远程 PAT')
    .action(async () => {
      const session = await tokenStore.getSession();
      if (session) {
        await authClient.logout(session);
      }
      await tokenStore.clearSession();
      stdout.write([
        '已清除本地 TVCMall MCP 登录状态。',
        '如需停用远程 PAT，请从 MCP Client 的远程 MCP 配置中移除 TVCMALL_API_KEY Header。',
        ''
      ].join('\n'));
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
