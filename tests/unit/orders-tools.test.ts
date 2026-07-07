import { describe, expect, it } from 'vitest';
import { getOrderDetailForMcp, listOrdersForMcp } from '../../src/tools/orders.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class MemoryTokenStore implements TokenStore {
  constructor(public session: StoredAuthSession | null) {}

  async getSession(): Promise<StoredAuthSession | null> { return this.session; }
  async saveSession(session: StoredAuthSession): Promise<void> { this.session = session; }
  async clearSession(): Promise<void> { this.session = null; }
}

const activeSession: StoredAuthSession = {
  customer: { id: 'fake_cus_001', email: 'fake.customer@example.com' },
  scopes: ['orders:read'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-07T12:00:00.000Z'
};

describe('order MCP tools', () => {
  it('listOrdersForMcp returns AUTH_REQUIRED when no session exists', async () => {
    const result = await listOrdersForMcp(
      { page: 1, page_size: 20, status: 'shipped' },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('listOrdersForMcp returns summarized fake orders without token values', async () => {
    const result = await listOrdersForMcp(
      { page: 1, page_size: 2, status: 'shipped' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      page: 1,
      page_size: 2,
      total: expect.any(Number),
      items: expect.any(Array)
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
    expect(JSON.stringify(result)).not.toContain('fake-refresh-token');
  });

  it('getOrderDetailForMcp returns fake order detail', async () => {
    const result = await getOrderDetailForMcp(
      { order_id: 'V10001' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient() }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      id: 'V10001',
      status: 'shipped',
      items: expect.any(Array),
      totals: expect.objectContaining({ currency: 'USD' })
    });
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
  });

  it('getOrderDetailForMcp returns ORDER_NOT_FOUND for missing orders', async () => {
    const result = await getOrderDetailForMcp(
      { order_id: 'missing_order' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient() }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('ORDER_NOT_FOUND');
  });
});
