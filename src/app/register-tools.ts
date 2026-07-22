import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AuthClient } from '../auth/auth-client.js';
import type { RequestAuthContext } from '../auth/request-auth-context.js';
import { WebApiRequestError } from '../api/http-client.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import type { OrderClient } from '../orders/order-client.js';
import type { PointsClient } from '../points/points-client.js';
import type { ProductClient } from '../products/product-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import type { TokenStore } from '../storage/token-store.js';
import type { TrackingClient } from '../tracking/tracking-client.js';
import { AuthStatusOutputSchema, createAuthStatusToolResult } from '../tools/auth-status.js';
import {
  GetOrderDetailInputSchema,
  ListOrdersInputSchema,
  ListOrdersOutputSchema,
  OrderDetailOutputSchema,
  getOrderDetailForMcp,
  listOrdersForMcp
} from '../tools/orders.js';
import {
  GetProductDetailInputSchema,
  ProductDetailSchema,
  SearchProductsInputSchema,
  SearchProductsOutputSchema,
  getProductDetailForMcp,
  searchProductsForMcp
} from '../tools/products.js';
import { GetPointsInputSchema, ListPointRecordsInputSchema, ListPointRecordsOutputSchema, PointsStatOutputSchema, getPointsForMcp, listPointRecordsForMcp } from '../tools/points.js';
import { EstimateShippingInputSchema, EstimateShippingOutputSchema, estimateShippingForMcp } from '../tools/shipping.js';
import {
  BatchGetTrackingInputSchema,
  BatchTrackingOutputSchema,
  GetTrackingInfoInputSchema,
  TrackingInfoOutputSchema,
  batchGetTrackingForMcp,
  getTrackingInfoForMcp
} from '../tools/tracking.js';

export interface RegisterToolDependencies {
  authContext?: RequestAuthContext;
  // Kept temporarily so the legacy stdio server can register tools during migration.
  tokenStore?: TokenStore;
  authClient?: AuthClient;
  productClient: ProductClient;
  pointsClient: PointsClient;
  shippingClient: ShippingClient;
  orderClient: OrderClient;
  trackingClient: TrackingClient;
}

export function registerTvcMallTools(server: McpServer, dependencies: RegisterToolDependencies): void {
  const { authContext, productClient, pointsClient, shippingClient, orderClient, trackingClient } = dependencies;

  server.registerTool(
    'tvcmall_auth_status',
    { title: 'TVCMall Auth Status', description: '检查当前 TVCMall MCP 是否已登录', inputSchema: z.object({}), outputSchema: AuthStatusOutputSchema },
    async () => handleToolCall(() => createAuthStatusToolResult(authContext))
  );

  server.registerTool(
    'tvcmall_search_products',
    { title: 'TVCMall Search Products', description: '通过 TVCMall WebApi 只读搜索商品', inputSchema: SearchProductsInputSchema, outputSchema: SearchProductsOutputSchema },
    async (input) => handleToolCall(() => searchProductsForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_product_detail',
    { title: 'TVCMall Get Product Detail', description: '通过 TVCMall WebApi 只读查询商品详情', inputSchema: GetProductDetailInputSchema, outputSchema: ProductDetailSchema },
    async (input) => handleToolCall(() => getProductDetailForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_points',
    { title: 'TVCMall Get Points', description: '查询当前客户 TVCMall 积分', inputSchema: GetPointsInputSchema, outputSchema: PointsStatOutputSchema },
    async (input) => handleToolCall(() => getPointsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_list_point_records',
    { title: 'TVCMall List Point Records', description: '查询当前客户 TVCMall 积分获取和使用记录', inputSchema: ListPointRecordsInputSchema, outputSchema: ListPointRecordsOutputSchema },
    async (input) => handleToolCall(() => listPointRecordsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_estimate_shipping',
    { title: 'TVCMall Estimate Shipping', description: '按商品 SKU、数量和目的国家/地区代码 countrycode 预估未下单商品运费；入参为 sku、quantity、countrycode。如果用户提供订单号并询问订单运费、物流费用、shipping fee、freight 或 delivery cost，请不要调用本工具，必须使用 tvcmall_get_tracking_info。', inputSchema: EstimateShippingInputSchema, outputSchema: EstimateShippingOutputSchema },
    async (input) => handleToolCall(() => estimateShippingForMcp(input, { authContext, shippingClient }))
  );

  server.registerTool(
    'tvcmall_list_orders',
    { title: 'TVCMall List Orders', description: '通过 TVCMall WebApi 只读查询订单列表', inputSchema: ListOrdersInputSchema, outputSchema: ListOrdersOutputSchema },
    async (input) => handleToolCall(() => listOrdersForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_order_detail',
    { title: 'TVCMall Get Order Detail', description: '查询 TVCMall 订单商品、金额、地址等详情；订单物流和运费查询请使用 tvcmall_get_tracking_info。', inputSchema: GetOrderDetailInputSchema, outputSchema: OrderDetailOutputSchema },
    async (input) => handleToolCall(() => getOrderDetailForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_tracking_info',
    { title: 'TVCMall Get Tracking Info', description: '查询单个 TVCMall 订单的物流和运费信息。当用户询问订单物流、物流轨迹、运费、shipping fee、freight、delivery cost 时，优先使用本工具。', inputSchema: GetTrackingInfoInputSchema, outputSchema: TrackingInfoOutputSchema },
    async (input) => handleToolCall(() => getTrackingInfoForMcp(input, { authContext, trackingClient }))
  );

  server.registerTool(
    'tvcmall_batch_get_tracking',
    { title: 'TVCMall Batch Get Tracking', description: '批量查询 TVCMall 订单物流和运费信息；单个订单物流或运费优先使用 tvcmall_get_tracking_info。', inputSchema: BatchGetTrackingInputSchema, outputSchema: BatchTrackingOutputSchema },
    async (input) => handleToolCall(() => batchGetTrackingForMcp(input, { authContext, trackingClient }))
  );

}

async function handleToolCall(operation: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await operation();
  } catch (error) {
    const code = error instanceof WebApiRequestError ? error.code : 'API_UNAVAILABLE';
    return {
      isError: true,
      content: [{ type: 'text', text: MCP_ERROR_MESSAGES[code] }]
    };
  }
}
