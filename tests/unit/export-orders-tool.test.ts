import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportOrdersForMcp } from '../../src/tools/export-orders.js';
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
  scopes: ['orders:export'],
  accessToken: 'fake-access-token',
  refreshToken: 'fake-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-08T12:00:00.000Z'
};

describe('exportOrdersForMcp', () => {
  let exportDir: string;

  beforeEach(async () => {
    exportDir = await mkdtemp(join(tmpdir(), 'tvcmall-export-test-'));
  });

  afterEach(async () => {
    await rm(exportDir, { recursive: true, force: true });
  });

  it('returns AUTH_REQUIRED when no session exists', async () => {
    const result = await exportOrdersForMcp(
      { start_date: '2026-06-01', end_date: '2026-06-30', status: 'shipped', format: 'csv' },
      { tokenStore: new MemoryTokenStore(null), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient(), exportDir }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('未登录');
  });

  it('exports fake orders to a timestamped csv file without token values', async () => {
    const result = await exportOrdersForMcp(
      { start_date: '2026-06-01', end_date: '2026-06-30', status: 'shipped', format: 'csv' },
      {
        tokenStore: new MemoryTokenStore(activeSession),
        authClient: new FakeAuthClient(),
        orderClient: new FakeOrderClient(),
        exportDir,
        now: () => new Date(2026, 6, 8, 10, 11, 12)
      }
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      file_path: expect.stringContaining('tvcmall-orders-20260708-101112.csv'),
      order_count: 1,
      format: 'csv',
      date_range: { start_date: '2026-06-01', end_date: '2026-06-30' }
    });
    const filePath = (result.structuredContent as { file_path: string }).file_path;
    const csv = await readFile(filePath, 'utf8');
    expect(csv).toContain('order_id,status,created_at,item_count,total_amount,currency');
    expect(csv).toContain('V10001,shipped,2026-06-18,10,58.8,USD');
    expect(JSON.stringify(result)).not.toContain('fake-access-token');
    expect(JSON.stringify(result)).not.toContain('fake-refresh-token');
  });

  it('returns a clear unsupported-format error for xlsx until xlsx export is implemented', async () => {
    const result = await exportOrdersForMcp(
      { start_date: '2026-06-01', end_date: '2026-06-30', format: 'xlsx' },
      { tokenStore: new MemoryTokenStore(activeSession), authClient: new FakeAuthClient(), orderClient: new FakeOrderClient(), exportDir }
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('EXPORT_FORMAT_UNSUPPORTED');
  });
});
