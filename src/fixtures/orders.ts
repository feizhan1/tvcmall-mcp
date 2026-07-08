import type { OrderDetail } from '../orders/order-client.js';

export const FIXTURE_ORDERS: OrderDetail[] = [
  {
    id: 'V10001',
    status: 'shipped',
    created_at: '2026-06-18',
    item_count: 10,
    total_amount: 58.8,
    currency: 'USD',
    items: [
      { product_id: 'prd_iphone_case_001', sku: 'TVC-IP15-CASE-CLEAR', title: 'Clear MagSafe Case for iPhone 15 Pro Max', quantity: 10, unit_price: 3.98, currency: 'USD' }
    ],
    shipping_address: { country: 'US', city: 'Los Angeles', masked_postcode: '90***' },
    totals: { subtotal: 39.8, shipping: 19, grand_total: 58.8, currency: 'USD' }
  },
  {
    id: 'V10002',
    status: 'delivered',
    created_at: '2026-06-22',
    item_count: 20,
    total_amount: 101,
    currency: 'USD',
    items: [
      { product_id: 'prd_iphone_case_002', sku: 'TVC-IP14-CASE-RUGGED', title: 'Rugged Armor Case for iPhone 14 Series', quantity: 20, unit_price: 4.65, currency: 'USD' }
    ],
    shipping_address: { country: 'US', city: 'New York', masked_postcode: '10***' },
    totals: { subtotal: 93, shipping: 8, grand_total: 101, currency: 'USD' }
  },
  {
    id: 'V10003',
    status: 'processing',
    created_at: '2026-07-02',
    item_count: 50,
    total_amount: 74.5,
    currency: 'USD',
    items: [
      { product_id: 'prd_screen_001', sku: 'TVC-IP15-TG-2PK', title: 'Tempered Glass Screen Protector for iPhone 15', quantity: 50, unit_price: 1.25, currency: 'USD' }
    ],
    shipping_address: { country: 'GB', city: 'London', masked_postcode: 'SW***' },
    totals: { subtotal: 62.5, shipping: 12, grand_total: 74.5, currency: 'USD' }
  }
];
