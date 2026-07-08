import { BaseHttpClient, firstArray, firstObject, readInteger, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ListOrdersInput, ListOrdersResult, OrderClient, OrderDetail, OrderItem, OrderStatus, OrderSummary } from './order-client.js';

export class HttpOrderClient extends BaseHttpClient implements OrderClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async listOrders(input: ListOrdersInput, session: StoredAuthSession): Promise<ListOrdersResult> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/getorders'), {
      method: 'POST',
      headers: this.authHeaders(session, true),
      body: JSON.stringify({
        keywords: '',
        pageindex: input.page,
        pagesize: input.page_size,
        status: input.status ?? 'All',
        withdetail: true
      })
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall order list'));
    const items = firstArray(payload, ['items', 'list', 'orders', 'records']).map(mapOrderSummary);

    return {
      page: input.page,
      page_size: input.page_size,
      total: readInteger(payload, ['total', 'totalCount', 'count', 'records'], items.length),
      items
    };
  }

  async getOrderDetail(orderId: string, session: StoredAuthSession): Promise<OrderDetail | null> {
    const response = await this.fetchImpl(this.createUrl('/v3/order/detail', { orderId }), {
      method: 'POST',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall order detail'));
    const order = firstObject(payload, ['order', 'detail', 'item']) ?? payload;
    if (Object.keys(order).length === 0) return null;
    return mapOrderDetail(order);
  }
}

function mapOrderSummary(source: JsonObject): OrderSummary {
  return {
    id: readString(source, ['id', 'order_id', 'orderId', 'orderNo']),
    status: mapOrderStatus(readString(source, ['status', 'orderStatus'])),
    created_at: readString(source, ['created_at', 'createTime', 'createdAt', 'orderTime']),
    item_count: readInteger(source, ['item_count', 'itemCount', 'qty', 'quantity'], 0),
    total_amount: readNumber(source, ['total_amount', 'totalAmount', 'orderAmount', 'grandTotal', 'amount']),
    currency: 'USD'
  };
}

function mapOrderDetail(source: JsonObject): OrderDetail {
  const items = firstArray(source, ['items', 'orderItems', 'products', 'details']).map(mapOrderItem);
  const summary = mapOrderSummary({
    ...source,
    itemCount: readInteger(source, ['item_count', 'itemCount'], items.reduce((sum, item) => sum + item.quantity, 0))
  });
  const address = firstObject(source, ['shippingAddress', 'shipping_address', 'address']) ?? source;

  return {
    ...summary,
    items,
    shipping_address: {
      country: readString(address, ['country', 'countryCode']),
      city: readString(address, ['city']),
      masked_postcode: maskPostcode(readString(address, ['masked_postcode', 'postcode', 'zip', 'postalCode']))
    },
    totals: {
      subtotal: readNumber(source, ['subtotal', 'subTotal', 'goodsAmount']),
      shipping: readNumber(source, ['shipping', 'shippingFee', 'freight']),
      grand_total: readNumber(source, ['grand_total', 'grandTotal', 'totalAmount', 'orderAmount']),
      currency: 'USD'
    }
  };
}

function mapOrderItem(source: JsonObject): OrderItem {
  return {
    product_id: readString(source, ['product_id', 'productId', 'id']),
    sku: readString(source, ['sku', 'skuCode']),
    title: readString(source, ['title', 'name', 'productName']),
    quantity: readInteger(source, ['quantity', 'qty', 'count'], 1),
    unit_price: readNumber(source, ['unit_price', 'unitPrice', 'price']),
    currency: 'USD'
  };
}

function mapOrderStatus(value: string): OrderStatus {
  const normalized = value.toLowerCase();
  if (normalized.includes('deliver')) return 'delivered';
  if (normalized.includes('ship')) return 'shipped';
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('process')) return 'processing';
  if (normalized.includes('pend')) return 'pending';
  return 'processing';
}

function maskPostcode(postcode: string): string {
  if (postcode.includes('*')) return postcode;
  if (postcode.length <= 2) return postcode ? '**' : '';
  return `${postcode.slice(0, 2)}***`;
}
