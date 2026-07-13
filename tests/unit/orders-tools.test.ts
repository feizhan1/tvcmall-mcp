import { describe, expect, it, vi } from 'vitest';
import { getOrderDetailForMcp, listOrdersForMcp } from '../../src/tools/orders.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['orders:read'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};

describe('order MCP tools', () => {
  it('passes the request-scoped upstream token to the order client', async () => {
    const orderClient = new FakeOrderClient();
    const listOrders = vi.spyOn(orderClient, 'listOrders');
    await listOrdersForMcp({ page: 1, page_size: 20 }, { authContext, orderClient });

    expect(listOrders).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      customer: { id: 'customer_123', email: '', name: 'TVCMall Buyer' },
      accessToken: 'short-lived-token', scopes: ['orders:read'], expiresAt: '2030-01-01T00:00:00.000Z'
    }));
  });

  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await listOrdersForMcp({ page: 1, page_size: 20 }, { orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED: 缺少或无效的 TVCMall API Key');
  });

  it('does not call order client when orders:read is absent', async () => {
    const orderClient = new FakeOrderClient();
    const listOrders = vi.spyOn(orderClient, 'listOrders');
    const result = await listOrdersForMcp({ page: 1, page_size: 20 }, { authContext: { ...authContext, scopes: ['products:read'] }, orderClient });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('returns summarized orders and order detail without short-lived token values', async () => {
    const orderClient = new FakeOrderClient();
    const orders = await listOrdersForMcp({ page: 1, page_size: 2, status: 'shipped' }, { authContext, orderClient });
    const detail = await getOrderDetailForMcp({ order_id: 'V10001' }, { authContext, orderClient });

    expect(orders.structuredContent).toMatchObject({ page: 1, page_size: 2, total: expect.any(Number), items: expect.any(Array) });
    expect(detail.structuredContent).toMatchObject({ id: 'V10001', status: 'shipped', totals: expect.objectContaining({ currency: 'USD' }) });
    expect(JSON.stringify([orders, detail])).not.toContain('short-lived-token');
  });

  it('returns ORDER_NOT_FOUND for missing orders', async () => {
    const result = await getOrderDetailForMcp({ order_id: 'missing_order' }, { authContext, orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('ORDER_NOT_FOUND');
  });
});
