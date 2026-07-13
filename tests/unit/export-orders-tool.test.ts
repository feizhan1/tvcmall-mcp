import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exporter = vi.hoisted(() => vi.fn());
vi.mock('../../src/export/csv-exporter.js', () => ({ exportOrdersToCsv: exporter }));

import { exportOrdersForMcp } from '../../src/tools/export-orders.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['orders:export'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};
const input = { start_date: '2026-06-01', end_date: '2026-06-30', status: 'shipped' as const, format: 'csv' as const };

describe('exportOrdersForMcp', () => {
  beforeEach(() => {
    exporter.mockResolvedValue({ file_path: '/tmp/tvcmall-orders-20260708-101112.csv' });
  });
  afterEach(() => vi.clearAllMocks());

  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await exportOrdersForMcp(input, { orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns export summary without a short-lived token', async () => {
    const result = await exportOrdersForMcp(input, { authContext, orderClient: new FakeOrderClient() });
    expect(result.structuredContent).toMatchObject({ file_path: '/tmp/tvcmall-orders-20260708-101112.csv', order_count: 1, format: 'csv', date_range: { start_date: '2026-06-01', end_date: '2026-06-30' } });
    expect(JSON.stringify(result)).not.toContain('short-lived-token');
    expect(exporter).toHaveBeenCalledOnce();
  });

  it('does not call order client or exporter when orders:export is absent', async () => {
    const orderClient = new FakeOrderClient();
    const listOrders = vi.spyOn(orderClient, 'listOrders');
    const result = await exportOrdersForMcp(input, { authContext: { ...authContext, scopes: [] }, orderClient });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(listOrders).not.toHaveBeenCalled();
    expect(exporter).not.toHaveBeenCalled();
  });

  it('returns unsupported format after authorization', async () => {
    const result = await exportOrdersForMcp({ ...input, format: 'xlsx' }, { authContext, orderClient: new FakeOrderClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('EXPORT_FORMAT_UNSUPPORTED');
  });
});
