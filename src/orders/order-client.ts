import type { StoredAuthSession } from '../storage/token-store.js';

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface ListOrdersInput {
  start_date?: string;
  end_date?: string;
  status?: OrderStatus;
  page: number;
  page_size: number;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  created_at: string;
  item_count: number;
  total_amount: number;
  currency: 'USD';
}

export interface OrderItem {
  product_id: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency: 'USD';
}

export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
  shipping_address: {
    country: string;
    city: string;
    masked_postcode: string;
  };
  totals: {
    subtotal: number;
    shipping: number;
    grand_total: number;
    currency: 'USD';
  };
}

export interface ListOrdersResult {
  page: number;
  page_size: number;
  total: number;
  items: OrderSummary[];
}

export interface OrderClient {
  listOrders(input: ListOrdersInput, session: StoredAuthSession): Promise<ListOrdersResult>;
  getOrderDetail(orderId: string, session: StoredAuthSession): Promise<OrderDetail | null>;
}
