import type { AuthStatus } from '../tools/auth-status.js';

export function formatWhoami(status: AuthStatus): string {
  if (!status.configured) {
    return [
      '本地 CLI 无法读取或判断远程 MCP 会话的 PAT 配置状态。',
      '请在 MCP Client 的远程 MCP 配置中设置 TVCMALL_API_KEY: tmcp_v1_{tokenId}.{secret}。'
    ].join('\n');
  }

  return [
    '当前远程 MCP 会话已配置 PAT。',
    'PAT 的最终有效性和权限以实际业务 WebApi 调用结果为准。'
  ].join('\n');
}
