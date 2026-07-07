import { describe, expect, it } from 'vitest';
import { formatWhoami } from '../../src/cli/messages.js';
import type { AuthStatus } from '../../src/tools/auth-status.js';

describe('formatWhoami', () => {
  it('guides unauthenticated users to run the login command', () => {
    const message = formatWhoami({ logged_in: false, scopes: [] });

    expect(message).toContain('当前未登录 TVCMall');
    expect(message).toContain('npx @tvcmall/mcp login');
  });

  it('shows account identity and scopes without token values', () => {
    const status: AuthStatus = {
      logged_in: true,
      customer_email: 'buyer@example.com',
      scopes: ['products:read', 'orders:read']
    };

    const message = formatWhoami(status);

    expect(message).toContain('buyer@example.com');
    expect(message).toContain('products:read, orders:read');
    expect(message).not.toMatch(/access[_-]?token/i);
    expect(message).not.toMatch(/refresh[_-]?token/i);
  });
});
