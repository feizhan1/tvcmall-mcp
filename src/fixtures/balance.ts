import type { BalanceRecord } from '../balance/balance-client.js';

export const FIXTURE_BALANCE_RECORDS: BalanceRecord[] = [
  {
    id: 'bal_1001',
    amount: 25,
    formatted_amount: '$25.00',
    direction: 'income',
    type: 'OrderRefund',
    description: 'Order refund returned to balance',
    order_id: 'VFIXTURE10001',
    display_date: '07/18/2026',
    created_at: '2026-07-18 08:30:00'
  },
  {
    id: 'bal_1002',
    amount: -12.5,
    formatted_amount: '-$12.50',
    direction: 'expense',
    type: 'UseBalanceToOrder',
    description: 'Balance used for order',
    order_id: 'VFIXTURE10002',
    display_date: '07/19/2026',
    created_at: '2026-07-19 09:15:00'
  },
  {
    id: 'bal_1003',
    amount: 8,
    formatted_amount: '$8.00',
    direction: 'income',
    type: 'Adjustment',
    description: 'Balance adjustment',
    order_id: '',
    display_date: '07/20/2026',
    created_at: '2026-07-20 10:00:00'
  }
];
