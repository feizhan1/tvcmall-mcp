import type { StoredAuthSession } from '../storage/token-store.js';

export type BalanceDirectionFilter = 'all' | 'income' | 'expense';
export type BalanceRecordDirection = 'income' | 'expense' | 'unknown';

export interface ListBalanceRecordsInput {
  direction: BalanceDirectionFilter;
  page: number;
  page_size: number;
}

export interface BalanceRecord {
  id: string;
  amount: number;
  formatted_amount: string;
  direction: BalanceRecordDirection;
  type: string;
  description: string;
  order_id: string;
  display_date: string;
  created_at: string;
}

export interface ListBalanceRecordsResult extends ListBalanceRecordsInput {
  total: number;
  items: BalanceRecord[];
}

export interface BalanceClient {
  listBalanceRecords(input: ListBalanceRecordsInput, session: StoredAuthSession): Promise<ListBalanceRecordsResult>;
}
