import { describe, expect, it } from 'vitest';
import { formatWhoami } from '../../src/cli/messages.js';
import type { AuthStatus } from '../../src/tools/auth-status.js';

describe('formatWhoami', () => {
  it('guides users to configure a PAT in the remote MCP client', () => {
    const message = formatWhoami({ configured: false });

    expect(message).toBe([
      '当前远程 MCP 会话未配置 PAT。',
      '请在 MCP Client 的远程 MCP 配置中设置 Authorization: Bearer tmcp_v1_{tokenId}.{secret}。'
    ].join('\n'));
  });

  it('reports only PAT configuration and defers validity to WebApi calls', () => {
    const status: AuthStatus = { configured: true };

    const message = formatWhoami(status);

    expect(message).toBe([
      '当前远程 MCP 会话已配置 PAT。',
      'PAT 的最终有效性和权限以实际业务 WebApi 调用结果为准。'
    ].join('\n'));
  });
});
