import type { AuthStatus } from '../tools/auth-status.js';

export function formatWhoami(status: AuthStatus): string {
  if (!status.configured) {
    return [
      '当前远程 MCP 会话未配置 PAT。',
      '请在 MCP Client 的远程 MCP 配置中设置 Authorization: Bearer tmcp_v1_{tokenId}.{secret}。'
    ].join('\n');
  }

  return [
    '当前远程 MCP 会话已配置 PAT。',
    'PAT 的最终有效性和权限以实际业务 WebApi 调用结果为准。'
  ].join('\n');
}
