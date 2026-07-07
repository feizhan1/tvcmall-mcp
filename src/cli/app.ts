import { Command } from 'commander';
import { formatWhoami } from './messages.js';
import { startMcpServer } from '../server.js';
import { getAuthStatus } from '../tools/auth-status.js';
import type { TokenStore } from '../storage/token-store.js';
import { createDefaultTokenStore } from '../storage/token-store.js';
import { PACKAGE_VERSION } from '../version.js';

export interface CliOutput {
  write(chunk: string): unknown;
}

export interface CliOptions {
  tokenStore?: TokenStore;
  stdout?: CliOutput;
  stderr?: CliOutput;
}

export function createCli(options: CliOptions = {}): Command {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
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
      await startMcpServer({ tokenStore });
    });

  program
    .command('whoami')
    .description('展示当前登录账号和权限范围')
    .action(async () => {
      stdout.write(`${formatWhoami(await getAuthStatus(tokenStore))}\n`);
    });

  program
    .command('login')
    .description('通过独立 CLI 登录 TVCMall')
    .action(() => {
      stdout.write(
        [
          'TVCMall MCP 登录命令已预留。',
          '后续接入 /api/mcp/auth/login 后，将在此命令中隐藏输入密码并保存 token。',
          '不要在 MCP tool 或 server stdio 通道中输入密码。'
        ].join('\n') + '\n'
      );
    });

  program
    .command('logout')
    .description('清除本地登录状态')
    .action(async () => {
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
