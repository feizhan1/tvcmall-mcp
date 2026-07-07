import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { AuthClient } from './auth/auth-client.js';
import { FakeAuthClient } from './auth/fake-auth-client.js';
import type { OrderClient } from './orders/order-client.js';
import { FakeOrderClient } from './orders/fake-order-client.js';
import type { ProductClient } from './products/product-client.js';
import { FakeProductClient } from './products/fake-product-client.js';
import type { ShippingClient } from './shipping/shipping-client.js';
import { FakeShippingClient } from './shipping/fake-shipping-client.js';
import type { TrackingClient } from './tracking/tracking-client.js';
import { FakeTrackingClient } from './tracking/fake-tracking-client.js';
import { AuthStatusOutputSchema, createAuthStatusToolResult } from './tools/auth-status.js';
import { GetOrderDetailInputSchema, ListOrdersInputSchema, ListOrdersOutputSchema, OrderDetailOutputSchema, getOrderDetailForMcp, listOrdersForMcp } from './tools/orders.js';
import { GetProductDetailInputSchema, ProductDetailSchema, SearchProductsInputSchema, SearchProductsOutputSchema, getProductDetailForMcp, searchProductsForMcp } from './tools/products.js';
import { EstimateShippingInputSchema, EstimateShippingOutputSchema, estimateShippingForMcp } from './tools/shipping.js';
import { BatchGetTrackingInputSchema, BatchTrackingOutputSchema, GetTrackingInfoInputSchema, TrackingInfoOutputSchema, batchGetTrackingForMcp, getTrackingInfoForMcp } from './tools/tracking.js';
import type { TokenStore } from './storage/token-store.js';
import { createDefaultTokenStore } from './storage/token-store.js';
import { PACKAGE_VERSION } from './version.js';

export interface ServerOptions {
  tokenStore?: TokenStore;
  authClient?: AuthClient;
  productClient?: ProductClient;
  shippingClient?: ShippingClient;
  orderClient?: OrderClient;
  trackingClient?: TrackingClient;
}

export function createTvcMallMcpServer(options: ServerOptions = {}): McpServer {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
  const authClient = options.authClient ?? new FakeAuthClient();
  const productClient = options.productClient ?? new FakeProductClient();
  const shippingClient = options.shippingClient ?? new FakeShippingClient();
  const orderClient = options.orderClient ?? new FakeOrderClient();
  const trackingClient = options.trackingClient ?? new FakeTrackingClient();
  const server = new McpServer({ name: 'tvcmall-mcp', version: PACKAGE_VERSION });

  server.registerTool('tvcmall_auth_status', { title: 'TVCMall Auth Status', description: '检查当前 TVCMall MCP 是否已登录', inputSchema: z.object({}), outputSchema: AuthStatusOutputSchema }, async () => createAuthStatusToolResult(tokenStore, { authClient }));

  server.registerTool('tvcmall_search_products', { title: 'TVCMall Search Products', description: '使用假数据搜索 TVCMall 商品，后续替换为真实商品 API', inputSchema: SearchProductsInputSchema, outputSchema: SearchProductsOutputSchema }, async (input) => searchProductsForMcp(input, { tokenStore, authClient, productClient }));

  server.registerTool('tvcmall_get_product_detail', { title: 'TVCMall Get Product Detail', description: '使用假数据查看 TVCMall 商品详情，后续替换为真实商品详情 API', inputSchema: GetProductDetailInputSchema, outputSchema: ProductDetailSchema }, async (input) => getProductDetailForMcp(input, { tokenStore, authClient, productClient }));

  server.registerTool('tvcmall_estimate_shipping', { title: 'TVCMall Estimate Shipping', description: '使用假数据估算 TVCMall 运费，后续替换为真实运费 API', inputSchema: EstimateShippingInputSchema, outputSchema: EstimateShippingOutputSchema }, async (input) => estimateShippingForMcp(input, { tokenStore, authClient, shippingClient }));

  server.registerTool('tvcmall_list_orders', { title: 'TVCMall List Orders', description: '使用假数据查询 TVCMall 订单列表，后续替换为真实订单 API', inputSchema: ListOrdersInputSchema, outputSchema: ListOrdersOutputSchema }, async (input) => listOrdersForMcp(input, { tokenStore, authClient, orderClient }));

  server.registerTool('tvcmall_get_order_detail', { title: 'TVCMall Get Order Detail', description: '使用假数据查询 TVCMall 订单详情，后续替换为真实订单详情 API', inputSchema: GetOrderDetailInputSchema, outputSchema: OrderDetailOutputSchema }, async (input) => getOrderDetailForMcp(input, { tokenStore, authClient, orderClient }));

  server.registerTool('tvcmall_get_tracking_info', { title: 'TVCMall Get Tracking Info', description: '使用假数据查询单个订单物流，后续替换为真实物流 API', inputSchema: GetTrackingInfoInputSchema, outputSchema: TrackingInfoOutputSchema }, async (input) => getTrackingInfoForMcp(input, { tokenStore, authClient, trackingClient }));

  server.registerTool('tvcmall_batch_get_tracking', { title: 'TVCMall Batch Get Tracking', description: '使用假数据批量查询订单物流，后续替换为真实批量物流 API', inputSchema: BatchGetTrackingInputSchema, outputSchema: BatchTrackingOutputSchema }, async (input) => batchGetTrackingForMcp(input, { tokenStore, authClient, trackingClient }));

  return server;
}

export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const server = createTvcMallMcpServer(options);
  await server.connect(new StdioServerTransport());
}
