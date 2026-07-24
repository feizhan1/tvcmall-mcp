import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MCP_ERROR_MESSAGES } from '../../src/errors/mcp-errors.js';
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
  const previousWebApiBaseUrl = process.env.TVCMALL_WEBAPI_BASE_URL;

  beforeEach(() => {
    process.env.TVCMALL_WEBAPI_BASE_URL = 'https://webapi.test';
  });

  afterEach(() => {
    if (previousWebApiBaseUrl === undefined) delete process.env.TVCMALL_WEBAPI_BASE_URL;
    else process.env.TVCMALL_WEBAPI_BASE_URL = previousWebApiBaseUrl;
  });

  it('registers the tvcmall_auth_status tool before connecting a transport', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(registeredTools).sort()).toEqual([
      'tvcmall_auth_status',
      'tvcmall_batch_get_tracking',
      'tvcmall_estimate_shipping',
      'tvcmall_get_order_detail',
      'tvcmall_get_points',
      'tvcmall_get_product_detail',
      'tvcmall_get_tracking_info',
      'tvcmall_list_balance_records',
      'tvcmall_list_orders',
      'tvcmall_list_point_records',
      'tvcmall_search_products'
    ]);
  });

  it('publishes descriptions that route related requests to the correct tools', () => {
    const server = createTvcMallMcpServer({ tokenStore: new FakeTokenStore() });
    const registeredTools = (server as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    })._registeredTools;

    const expectedDescriptions = {
      tvcmall_auth_status: '用于检查当前 MCP 会话是否已配置 TVCMALL_API_KEY；仅返回配置状态，不验证凭证有效性，也不调用 WebApi。',
      tvcmall_search_products: '用于按关键词分页搜索商品；已知 product_id 并需要 SKU、价格、库存或属性详情时，使用 tvcmall_get_product_detail。',
      tvcmall_get_product_detail: '用于按 product_id 查询单个商品的 SKU、价格、库存和属性详情；需要按关键词查找商品时，使用 tvcmall_search_products。',
      tvcmall_get_points: '用于查询当前客户的积分汇总；需要逐笔积分获取和使用记录时，使用 tvcmall_list_point_records。',
      tvcmall_list_point_records: '用于分页查询当前客户的积分获取和使用记录；需要积分汇总时，使用 tvcmall_get_points。',
      tvcmall_list_balance_records: '用于按 all、income 或 expense 分页查询当前客户的余额流水；积分查询请使用 tvcmall_get_points 或 tvcmall_list_point_records。',
      tvcmall_estimate_shipping: '用于按 sku、quantity 和 countrycode 预估未下单商品的运费；已有订单的物流、运费、shipping fee、freight 或 delivery cost 必须使用 tvcmall_get_tracking_info。',
      tvcmall_list_orders: '用于按日期和订单状态分页查询。根据用户意图设置 status：未指定或查询全部为 V3All；待付款为 V3Unpaid；待确认为 V3AwaitingConfirmation；备货中为 V3Preparing；已发货为 V3Shipped；已完成为 V3Done。已知 order_id 且需要商品、金额或收货信息时，使用 tvcmall_get_order_detail。',
      tvcmall_get_order_detail: '用于按 order_id 查询订单商品、金额和后端已脱敏的收货信息；订单物流、物流轨迹或运费必须使用 tvcmall_get_tracking_info。',
      tvcmall_get_tracking_info: '用于按单个 order_id 查询订单物流轨迹和订单运费；多个订单同时查询时，使用 tvcmall_batch_get_tracking。',
      tvcmall_batch_get_tracking: '用于批量查询多个订单的物流和订单运费；只有单个订单时，使用 tvcmall_get_tracking_info。'
    };

    expect(Object.fromEntries(
      Object.keys(expectedDescriptions).map((toolName) => [toolName, registeredTools[toolName]?.description])
    )).toEqual(expectedDescriptions);
    expect(JSON.stringify(registeredTools)).not.toContain('使用假数据');
  });

  it('does not expose removed validation or token-refresh error codes', () => {
    expect(MCP_ERROR_MESSAGES).not.toHaveProperty(['VALIDATION', 'ERROR'].join('_'));
    expect(MCP_ERROR_MESSAGES).not.toHaveProperty(['TOKEN', 'EXPIRED'].join('_'));
  });
});
