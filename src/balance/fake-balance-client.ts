import { FIXTURE_BALANCE_RECORDS } from '../fixtures/balance.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { BalanceClient, ListBalanceRecordsInput, ListBalanceRecordsResult } from './balance-client.js';

export class FakeBalanceClient implements BalanceClient {
  async listBalanceRecords(input: ListBalanceRecordsInput, _session: StoredAuthSession): Promise<ListBalanceRecordsResult> {
    const records = input.direction === 'all'
      ? FIXTURE_BALANCE_RECORDS
      : FIXTURE_BALANCE_RECORDS.filter((item) => item.direction === input.direction);
    const start = (input.page - 1) * input.page_size;

    return {
      ...input,
      total: records.length,
      items: records.slice(start, start + input.page_size).map((item) => ({ ...item }))
    };
  }
}
