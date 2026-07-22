import { describe, expect, it } from 'vitest';
import { FakeBalanceClient } from '../../src/balance/fake-balance-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';

const session: StoredAuthSession = {
  customer: { id: 'fixture-customer', email: 'fixture@example.test' },
  scopes: [],
  accessToken: 'tmcp_v1_test-id.test-secret',
  refreshToken: 'fixture-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-07-22T00:00:00.000Z'
};

describe('FakeBalanceClient', () => {
  it('returns records matching the requested direction', async () => {
    const client = new FakeBalanceClient();

    const income = await client.listBalanceRecords({ direction: 'income', page: 1, page_size: 20 }, session);
    const expense = await client.listBalanceRecords({ direction: 'expense', page: 1, page_size: 20 }, session);

    expect(income.items).toHaveLength(2);
    expect(income.items.every((item) => item.direction === 'income')).toBe(true);
    expect(expense.items).toHaveLength(1);
    expect(expense.items.every((item) => item.direction === 'expense')).toBe(true);
  });

  it('paginates all records without mutating the shared fixture', async () => {
    const client = new FakeBalanceClient();

    const first = await client.listBalanceRecords({ direction: 'all', page: 2, page_size: 1 }, session);
    first.items[0].description = 'mutated description';
    const second = await client.listBalanceRecords({ direction: 'all', page: 2, page_size: 1 }, session);

    expect(first).toMatchObject({ direction: 'all', page: 2, page_size: 1, total: 3 });
    expect(first.items).toHaveLength(1);
    expect(second.items[0].description).not.toBe('mutated description');
  });
});
