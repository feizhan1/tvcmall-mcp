import readline from 'node:readline/promises';
import { Command } from 'commander';
import { formatWhoami } from './messages.js';
import { createTvcMallClients } from '../app/client-factory.js';
import type { AuthClient, AuthLoginInput } from '../auth/auth-client.js';
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

interface LoginCommandOptions {
  email?: string;
  password?: string;
  rememberme?: boolean;
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
    .description(runtimeConfig.dataSource === 'real' ? '登录 TVCMall MCP 并保存真实 token session' : '使用假数据登录 TVCMall MCP，本地保存 fake token session')
    .option('--email <email>', '真实登录邮箱；未提供时交互式输入')
    .option('--password <password>', '真实登录密码；不建议在共享 shell 历史中使用，未提供时隐藏输入')
    .option('--no-rememberme', '真实登录时关闭 rememberme')
    .action(async (loginOptions: LoginCommandOptions) => {
      const loginInput = await resolveLoginInput(loginOptions, runtimeConfig);
      const session = await authClient.login(loginInput);
      await tokenStore.saveSession(session);
      stdout.write(formatLoginSuccess(session.customer.email, session.scopes, runtimeConfig.dataSource) + '\n');
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

async function resolveLoginInput(options: LoginCommandOptions, runtimeConfig: TvcMallRuntimeConfig): Promise<AuthLoginInput | undefined> {
  if (runtimeConfig.dataSource !== 'real') {
    return undefined;
  }

  const email = (options.email ?? await promptVisible('TVCMall email: ')).trim();
  const password = options.password ?? await promptPassword('TVCMall password: ');

  if (!email || !password) {
    throw new Error('真实登录需要 email 和 password');
  }

  return {
    email,
    password,
    rememberme: options.rememberme !== false
  };
}

async function promptVisible(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('非交互环境请为 login 提供 --email');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function promptPassword(question: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;

  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('非交互环境请为 login 提供 --password');
  }

  output.write(question);
  return new Promise<string>((resolve, reject) => {
    let password = '';
    const wasRaw = input.isRaw ?? false;

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      output.write('\n');
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('登录已取消'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(password);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          password = password.slice(0, -1);
          continue;
        }
        password += char;
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

function formatLoginSuccess(email: string, scopes: string[], dataSource: TvcMallRuntimeConfig['dataSource']): string {
  if (dataSource === 'real') {
    return [
      '已登录 TVCMall MCP。',
      `当前账号：${email}`,
      `权限范围：${scopes.join(', ') || '未返回'}`,
      '已保存登录 token 到系统凭证库，后续 MCP tools 会使用该 token 调用真实 HTTP API。'
    ].join('\n');
  }

  return [
    '已使用假数据登录 TVCMall MCP。',
    `当前账号：${email}`,
    `权限范围：${scopes.join(', ')}`,
    '注意：当前为本地开发 fake token；设置 TVCMALL_DATA_SOURCE=real 后 login 会调用真实 /user/login。'
  ].join('\n');
}
