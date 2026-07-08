import { describe, expect, it } from 'vitest';
import { createTvcMallMcpServer } from '../../src/server.js';
import type { StoredAuthSession, TokenStore } from '../../src/storage/token-store.js';

class FakeTokenStore implements TokenStore {
  async getSession(): Promise<StoredAuthSession | null> {
    return null;
  }

  async saveSession(): Promise<void> {}

  async clearSession(): Promise<void> {}
}

describe('createTvcMallMcpServer', () => {
  it('registers the tvcmall_auth_status tool before connecting a transport', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(registeredTools)).toContain('tvcmall_auth_status');
    expect(Object.keys(registeredTools)).toContain('tvcmall_search_products');
    expect(Object.keys(registeredTools)).toContain('tvcmall_estimate_shipping');
    expect(Object.keys(registeredTools)).toContain('tvcmall_batch_get_tracking');
    expect(Object.keys(registeredTools)).toContain('tvcmall_export_orders');
    expect(Object.keys(registeredTools)).toContain('tvcmall_get_tracking_info');
    expect(Object.keys(registeredTools)).toContain('tvcmall_get_order_detail');
    expect(Object.keys(registeredTools)).toContain('tvcmall_list_orders');
    expect(Object.keys(registeredTools)).toContain('tvcmall_get_product_detail');
  });

  it('guides order logistics and shipping fee requests to the tracking tool', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools;

    expect(registeredTools.tvcmall_get_tracking_info.description).toContain('物流和运费');
    expect(registeredTools.tvcmall_get_tracking_info.description).toContain('优先使用本工具');
    expect(registeredTools.tvcmall_estimate_shipping.description).toContain('订单运费');
    expect(registeredTools.tvcmall_estimate_shipping.description).toContain('tvcmall_get_tracking_info');
    expect(registeredTools.tvcmall_get_order_detail.description).toContain('订单物流和运费查询请使用 tvcmall_get_tracking_info');
  });
});
