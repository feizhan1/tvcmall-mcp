import type { AuthStatus } from '../tools/auth-status.js';

export function formatWhoami(status: AuthStatus): string {
  if (!status.logged_in) {
    return ['当前未登录 TVCMall。请先在终端执行：', 'npx @tvcmall/mcp login'].join('\n');
  }

  const scopes = status.scopes.length > 0 ? status.scopes.join(', ') : '无';
  return [`当前登录账号：${status.customer_email ?? '未知账号'}`, `权限范围：${scopes}`].join('\n');
}
