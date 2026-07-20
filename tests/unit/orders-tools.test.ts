import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { getOrderDetailForMcp, listOrdersForMcp } from '../../src/tools/orders.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('order MCP tools', () => {
  it('passes the request-scoped PAT to the order client', async () => {
    const orderClient = new FakeOrderClient();
    const listOrders = vi.spyOn(orderClient, 'listOrders');
    await listOrdersForMcp({ page: 1, page_size: 20 }, { authContext, orderClient });

    expect(listOrders).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accessToken: pat,
      scopes: []
    }));
  });

  it('returns PAT auth required when request auth context is missing', async () => {
    const result = await listOrdersForMcp({ page: 1, page_size: 20 }, { orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED: 缺少或无效的 TVCMall MCP PAT');
  });

  it('calls the order client without a local scope list', async () => {
    const orderClient = new FakeOrderClient();
    const listOrders = vi.spyOn(orderClient, 'listOrders');
    const result = await listOrdersForMcp({ page: 1, page_size: 20 }, { authContext, orderClient });
    expect(result.isError).toBeUndefined();
    expect(listOrders).toHaveBeenCalled();
  });

  it('returns summarized orders and order detail without PAT values', async () => {
    const orderClient = new FakeOrderClient();
    const orders = await listOrdersForMcp({ page: 1, page_size: 2, status: 'shipped' }, { authContext, orderClient });
    const detail = await getOrderDetailForMcp({ order_id: 'V10001' }, { authContext, orderClient });

    expect(orders.structuredContent).toMatchObject({ page: 1, page_size: 2, total: expect.any(Number), items: expect.any(Array) });
    expect(detail.structuredContent).toMatchObject({ id: 'V10001', status: 'shipped', totals: expect.objectContaining({ currency: 'USD' }) });
    expect(JSON.stringify([orders, detail])).not.toContain(pat);
  });

  it('returns ORDER_NOT_FOUND for missing orders', async () => {
    const result = await getOrderDetailForMcp({ order_id: 'missing_order' }, { authContext, orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('ORDER_NOT_FOUND');
  });
});
