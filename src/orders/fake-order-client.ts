import { FIXTURE_ORDERS } from '../fixtures/orders.js';
import type { ListOrdersInput, ListOrdersResult, OrderClient, OrderDetail, OrderSummary } from './order-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

export class FakeOrderClient implements OrderClient {
  async listOrders(input: ListOrdersInput, _session: StoredAuthSession): Promise<ListOrdersResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(Math.max(1, input.page_size), 50);
    const filtered = FIXTURE_ORDERS.filter((order) => {
      if (input.status && order.status !== input.status) return false;
      if (input.start_date && order.created_at < input.start_date) return false;
      if (input.end_date && order.created_at > input.end_date) return false;
      return true;
    });
    const start = (page - 1) * pageSize;
    const items: OrderSummary[] = filtered
      .slice(start, start + pageSize)
      .map(({ items: _items, shipping_address: _address, totals: _totals, ...summary }) => summary);

    return { page, page_size: pageSize, total: filtered.length, items };
  }

  async getOrderDetail(orderId: string, _session: StoredAuthSession): Promise<OrderDetail | null> {
    return FIXTURE_ORDERS.find((order) => order.id === orderId) ?? null;
  }
}
