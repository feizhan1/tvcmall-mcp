import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { OrderSummary } from '../orders/order-client.js';

export interface CsvExportOptions {
  exportDir?: string;
  now?: () => Date;
}

export interface CsvExportResult {
  file_path: string;
}

export async function exportOrdersToCsv(orders: OrderSummary[], options: CsvExportOptions = {}): Promise<CsvExportResult> {
  const exportDir = options.exportDir ?? join(homedir(), 'Downloads', 'tvcmall-exports');
  const now = options.now?.() ?? new Date();
  await mkdir(exportDir, { recursive: true });

  const filePath = join(exportDir, `tvcmall-orders-${formatTimestamp(now)}.csv`);
  const rows = [
    ['order_id', 'status', 'created_at', 'item_count', 'total_amount', 'currency'],
    ...orders.map((order) => [order.id, order.status, order.created_at, String(order.item_count), String(order.total_amount), order.currency])
  ];

  await writeFile(filePath, rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n') + '\n', 'utf8');
  return { file_path: filePath };
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
