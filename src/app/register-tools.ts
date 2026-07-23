import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AuthClient } from '../auth/auth-client.js';
import type { RequestAuthContext } from '../auth/request-auth-context.js';
import type { BalanceClient } from '../balance/balance-client.js';
import { WebApiRequestError, type WebApiFailureMetadata } from '../api/http-client.js';
import { MCP_ERROR_MESSAGES, type McpErrorCode } from '../errors/mcp-errors.js';
import type { McpHttpLogger, TvcMallToolName } from '../logging/mcp-http-logger.js';
import type { OrderClient } from '../orders/order-client.js';
import type { PointsClient } from '../points/points-client.js';
import type { ProductClient } from '../products/product-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import type { TokenStore } from '../storage/token-store.js';
import type { TrackingClient } from '../tracking/tracking-client.js';
import { AuthStatusOutputSchema, createAuthStatusToolResult } from '../tools/auth-status.js';
import { ListBalanceRecordsInputSchema, ListBalanceRecordsOutputSchema, listBalanceRecordsForMcp } from '../tools/balance.js';
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
  balanceClient: BalanceClient;
  logger?: McpHttpLogger;
  productClient: ProductClient;
  pointsClient: PointsClient;
  shippingClient: ShippingClient;
  orderClient: OrderClient;
  trackingClient: TrackingClient;
}

export function registerTvcMallTools(server: McpServer, dependencies: RegisterToolDependencies): void {
  const { authContext, balanceClient, logger, productClient, pointsClient, shippingClient, orderClient, trackingClient } = dependencies;

  server.registerTool(
    'tvcmall_auth_status',
    { title: 'TVCMall Auth Status', description: '检查当前 TVCMall MCP 是否已登录', inputSchema: z.object({}), outputSchema: AuthStatusOutputSchema },
    async () => handleToolCall('tvcmall_auth_status', logger, () => createAuthStatusToolResult(authContext))
  );

  server.registerTool(
    'tvcmall_search_products',
    { title: 'TVCMall Search Products', description: '通过 TVCMall WebApi 只读搜索商品', inputSchema: SearchProductsInputSchema, outputSchema: SearchProductsOutputSchema },
    async (input) => handleToolCall('tvcmall_search_products', logger, () => searchProductsForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_product_detail',
    { title: 'TVCMall Get Product Detail', description: '通过 TVCMall WebApi 只读查询商品详情', inputSchema: GetProductDetailInputSchema, outputSchema: ProductDetailSchema },
    async (input) => handleToolCall('tvcmall_get_product_detail', logger, () => getProductDetailForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_points',
    { title: 'TVCMall Get Points', description: '查询当前客户 TVCMall 积分', inputSchema: GetPointsInputSchema, outputSchema: PointsStatOutputSchema },
    async (input) => handleToolCall('tvcmall_get_points', logger, () => getPointsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_list_point_records',
    { title: 'TVCMall List Point Records', description: '查询当前客户 TVCMall 积分获取和使用记录', inputSchema: ListPointRecordsInputSchema, outputSchema: ListPointRecordsOutputSchema },
    async (input) => handleToolCall('tvcmall_list_point_records', logger, () => listPointRecordsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_list_balance_records',
    {
      title: 'TVCMall List Balance Records',
      description: '分页查询当前客户的余额获取和消耗流水；可使用 all、income、expense 筛选',
      inputSchema: ListBalanceRecordsInputSchema,
      outputSchema: ListBalanceRecordsOutputSchema
    },
    async (input) => handleToolCall('tvcmall_list_balance_records', logger, () => listBalanceRecordsForMcp(input, { authContext, balanceClient }))
  );

  server.registerTool(
    'tvcmall_estimate_shipping',
    { title: 'TVCMall Estimate Shipping', description: '按商品 SKU、数量和目的国家/地区代码 countrycode 预估未下单商品运费；入参为 sku、quantity、countrycode。如果用户提供订单号并询问订单运费、物流费用、shipping fee、freight 或 delivery cost，请不要调用本工具，必须使用 tvcmall_get_tracking_info。', inputSchema: EstimateShippingInputSchema, outputSchema: EstimateShippingOutputSchema },
    async (input) => handleToolCall('tvcmall_estimate_shipping', logger, () => estimateShippingForMcp(input, { authContext, shippingClient }))
  );

  server.registerTool(
    'tvcmall_list_orders',
    { title: 'TVCMall List Orders', description: '通过 TVCMall WebApi 只读查询订单列表', inputSchema: ListOrdersInputSchema, outputSchema: ListOrdersOutputSchema },
    async (input) => handleToolCall('tvcmall_list_orders', logger, () => listOrdersForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_order_detail',
    { title: 'TVCMall Get Order Detail', description: '查询 TVCMall 订单商品、金额、地址等详情；订单物流和运费查询请使用 tvcmall_get_tracking_info。', inputSchema: GetOrderDetailInputSchema, outputSchema: OrderDetailOutputSchema },
    async (input) => handleToolCall('tvcmall_get_order_detail', logger, () => getOrderDetailForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_tracking_info',
    { title: 'TVCMall Get Tracking Info', description: '查询单个 TVCMall 订单的物流和运费信息。当用户询问订单物流、物流轨迹、运费、shipping fee、freight、delivery cost 时，优先使用本工具。', inputSchema: GetTrackingInfoInputSchema, outputSchema: TrackingInfoOutputSchema },
    async (input) => handleToolCall('tvcmall_get_tracking_info', logger, () => getTrackingInfoForMcp(input, { authContext, trackingClient }))
  );

  server.registerTool(
    'tvcmall_batch_get_tracking',
    { title: 'TVCMall Batch Get Tracking', description: '批量查询 TVCMall 订单物流和运费信息；单个订单物流或运费优先使用 tvcmall_get_tracking_info。', inputSchema: BatchGetTrackingInputSchema, outputSchema: BatchTrackingOutputSchema },
    async (input) => handleToolCall('tvcmall_batch_get_tracking', logger, () => batchGetTrackingForMcp(input, { authContext, trackingClient }))
  );

}

async function handleToolCall(
  toolName: TvcMallToolName,
  logger: McpHttpLogger | undefined,
  operation: () => CallToolResult | Promise<CallToolResult>
): Promise<CallToolResult> {
  const startedAt = Date.now();
  let result: CallToolResult;
  let webApiFailureMetadata: WebApiFailureMetadata | undefined;
  try {
    result = await operation();
  } catch (error) {
    const code = error instanceof WebApiRequestError ? error.code : 'API_UNAVAILABLE';
    if (error instanceof WebApiRequestError) webApiFailureMetadata = error.metadata;
    result = {
      isError: true,
      content: [{ type: 'text', text: MCP_ERROR_MESSAGES[code] }]
    };
  }

  logger?.toolCompleted({
    toolName,
    outcome: result.isError ? 'error' : 'success',
    ...(result.isError ? { errorCode: readKnownMcpErrorCode(result), ...webApiFailureMetadata } : {}),
    durationMs: Date.now() - startedAt
  });
  return result;
}

function readKnownMcpErrorCode(result: CallToolResult): McpErrorCode | undefined {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) return undefined;

  return (Object.entries(MCP_ERROR_MESSAGES) as [McpErrorCode, string][])
    .find(([, message]) => text.startsWith(message))?.[0];
}
