import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toStoredAuthSession, type RequestAuthContext } from '../auth/request-auth-context.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakeOrderClient } from '../orders/fake-order-client.js';
import type { OrderClient } from '../orders/order-client.js';

export const OrderStatusSchema = z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']);

export const ListOrdersInputSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: OrderStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(50).default(20)
});

export const GetOrderDetailInputSchema = z.object({
  order_id: z.string().trim().min(1)
});

const OrderSummarySchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  created_at: z.string(),
  item_count: z.number().int(),
  total_amount: z.number(),
  currency: z.literal('USD')
});

export const ListOrdersOutputSchema = z.object({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  items: z.array(OrderSummarySchema)
});

export const OrderDetailOutputSchema = OrderSummarySchema.extend({
  items: z.array(z.object({
    product_id: z.string(),
    sku: z.string(),
    title: z.string(),
    quantity: z.number().int(),
    unit_price: z.number(),
    currency: z.literal('USD')
  })),
  shipping_address: z.object({
    country: z.string(),
    city: z.string(),
    masked_postcode: z.string()
  }),
  totals: z.object({
    subtotal: z.number(),
    shipping: z.number(),
    grand_total: z.number(),
    currency: z.literal('USD')
  })
});

export type ListOrdersInput = z.infer<typeof ListOrdersInputSchema>;
export type GetOrderDetailInput = z.infer<typeof GetOrderDetailInputSchema>;

export interface OrderToolDependencies {
  authContext?: RequestAuthContext;
  orderClient?: OrderClient;
}

export async function listOrdersForMcp(input: ListOrdersInput, dependencies: OrderToolDependencies): Promise<CallToolResult> {
  const session = dependencies.authContext?.pat && toStoredAuthSession(dependencies.authContext);
  if (!session) return authRequiredResult();

  const parsedInput = ListOrdersInputSchema.parse(input);
  const orderClient = dependencies.orderClient ?? new FakeOrderClient();
  const result = await orderClient.listOrders(parsedInput, session);

  return {
    content: [{ type: 'text', text: formatOrderList(result) }],
    structuredContent: { ...result }
  };
}

export async function getOrderDetailForMcp(input: GetOrderDetailInput, dependencies: OrderToolDependencies): Promise<CallToolResult> {
  const session = dependencies.authContext?.pat && toStoredAuthSession(dependencies.authContext);
  if (!session) return authRequiredResult();

  const parsedInput = GetOrderDetailInputSchema.parse(input);
  const orderClient = dependencies.orderClient ?? new FakeOrderClient();
  const order = await orderClient.getOrderDetail(parsedInput.order_id, session);

  if (!order) {
    return { isError: true, content: [{ type: 'text', text: `ORDER_NOT_FOUND: 未找到订单 ${parsedInput.order_id}` }] };
  }

  return {
    content: [{ type: 'text', text: `${order.id} - ${order.status} - ${order.currency} ${order.total_amount.toFixed(2)}` }],
    structuredContent: { ...order }
  };
}

function authRequiredResult(): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
}

function formatOrderList(result: z.infer<typeof ListOrdersOutputSchema>): string {
  if (result.items.length === 0) return '未找到匹配订单';
  return [`找到 ${result.total} 个订单，当前返回 ${result.items.length} 个：`, ...result.items.map((order) => `${order.id} - ${order.status} - ${order.currency} ${order.total_amount.toFixed(2)}`)].join('\n');
}
