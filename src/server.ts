import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { AuthClient } from './auth/auth-client.js';
import { FakeAuthClient } from './auth/fake-auth-client.js';
import { AuthStatusOutputSchema, createAuthStatusToolResult } from './tools/auth-status.js';
import type { TokenStore } from './storage/token-store.js';
import { createDefaultTokenStore } from './storage/token-store.js';
import { PACKAGE_VERSION } from './version.js';

export interface ServerOptions {
  tokenStore?: TokenStore;
  authClient?: AuthClient;
}

export function createTvcMallMcpServer(options: ServerOptions = {}): McpServer {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
  const authClient = options.authClient ?? new FakeAuthClient();
  const server = new McpServer({
    name: 'tvcmall-mcp',
    version: PACKAGE_VERSION
  });

  server.registerTool(
    'tvcmall_auth_status',
    {
      title: 'TVCMall Auth Status',
      description: '检查当前 TVCMall MCP 是否已登录',
      inputSchema: z.object({}),
      outputSchema: AuthStatusOutputSchema
    },
    async () => createAuthStatusToolResult(tokenStore, { authClient })
  );

  return server;
}

export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const server = createTvcMallMcpServer(options);
  await server.connect(new StdioServerTransport());
}
