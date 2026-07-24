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
    { title: 'TVCMall Auth Status', description: '用于检查当前 MCP 会话是否已配置 TVCMALL_API_KEY；仅返回配置状态，不验证凭证有效性，也不调用 WebApi。', inputSchema: z.object({}), outputSchema: AuthStatusOutputSchema },
    async () => handleToolCall('tvcmall_auth_status', logger, () => createAuthStatusToolResult(authContext))
  );

  server.registerTool(
    'tvcmall_search_products',
    { title: 'TVCMall Search Products', description: '用于按关键词分页搜索商品；已知 product_id 并需要 SKU、价格、库存或属性详情时，使用 tvcmall_get_product_detail。', inputSchema: SearchProductsInputSchema, outputSchema: SearchProductsOutputSchema },
    async (input) => handleToolCall('tvcmall_search_products', logger, () => searchProductsForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_product_detail',
    { title: 'TVCMall Get Product Detail', description: '用于按 product_id 查询单个商品的 SKU、价格、库存和属性详情；需要按关键词查找商品时，使用 tvcmall_search_products。', inputSchema: GetProductDetailInputSchema, outputSchema: ProductDetailSchema },
    async (input) => handleToolCall('tvcmall_get_product_detail', logger, () => getProductDetailForMcp(input, { authContext, productClient }))
  );

  server.registerTool(
    'tvcmall_get_points',
    { title: 'TVCMall Get Points', description: '用于查询当前客户的积分汇总；需要逐笔积分获取和使用记录时，使用 tvcmall_list_point_records。', inputSchema: GetPointsInputSchema, outputSchema: PointsStatOutputSchema },
    async (input) => handleToolCall('tvcmall_get_points', logger, () => getPointsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_list_point_records',
    { title: 'TVCMall List Point Records', description: '用于按方向分页查询当前客户的积分流水。direction：全部或未指定为 all；获得、获取积分为 got；使用、消耗积分为 used。需要积分汇总时，使用 tvcmall_get_points。', inputSchema: ListPointRecordsInputSchema, outputSchema: ListPointRecordsOutputSchema },
    async (input) => handleToolCall('tvcmall_list_point_records', logger, () => listPointRecordsForMcp(input, { authContext, pointsClient }))
  );

  server.registerTool(
    'tvcmall_list_balance_records',
    {
      title: 'TVCMall List Balance Records',
      description: '用于按 all、income 或 expense 分页查询当前客户的余额流水；积分查询请使用 tvcmall_get_points 或 tvcmall_list_point_records。',
      inputSchema: ListBalanceRecordsInputSchema,
      outputSchema: ListBalanceRecordsOutputSchema
    },
    async (input) => handleToolCall('tvcmall_list_balance_records', logger, () => listBalanceRecordsForMcp(input, { authContext, balanceClient }))
  );

  server.registerTool(
    'tvcmall_estimate_shipping',
    { title: 'TVCMall Estimate Shipping', description: '用于按 sku、quantity 和 countrycode 预估未下单商品的运费；已有订单的物流、运费、shipping fee、freight 或 delivery cost 必须使用 tvcmall_get_tracking_info。', inputSchema: EstimateShippingInputSchema, outputSchema: EstimateShippingOutputSchema },
    async (input) => handleToolCall('tvcmall_estimate_shipping', logger, () => estimateShippingForMcp(input, { authContext, shippingClient }))
  );

  server.registerTool(
    'tvcmall_list_orders',
    { title: 'TVCMall List Orders', description: '用于按日期和订单状态分页查询。根据用户意图设置 status：未指定或查询全部为 V3All；待付款为 V3Unpaid；待确认为 V3AwaitingConfirmation；备货中为 V3Preparing；已发货为 V3Shipped；已完成为 V3Done。已知 order_id 且需要商品、金额或收货信息时，使用 tvcmall_get_order_detail。', inputSchema: ListOrdersInputSchema, outputSchema: ListOrdersOutputSchema },
    async (input) => handleToolCall('tvcmall_list_orders', logger, () => listOrdersForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_order_detail',
    { title: 'TVCMall Get Order Detail', description: '用于按 order_id 查询订单商品、金额和后端已脱敏的收货信息；订单物流、物流轨迹或运费必须使用 tvcmall_get_tracking_info。', inputSchema: GetOrderDetailInputSchema, outputSchema: OrderDetailOutputSchema },
    async (input) => handleToolCall('tvcmall_get_order_detail', logger, () => getOrderDetailForMcp(input, { authContext, orderClient }))
  );

  server.registerTool(
    'tvcmall_get_tracking_info',
    { title: 'TVCMall Get Tracking Info', description: '用于按单个 order_id 查询订单物流轨迹和订单运费；多个订单同时查询时，使用 tvcmall_batch_get_tracking。', inputSchema: GetTrackingInfoInputSchema, outputSchema: TrackingInfoOutputSchema },
    async (input) => handleToolCall('tvcmall_get_tracking_info', logger, () => getTrackingInfoForMcp(input, { authContext, trackingClient }))
  );

  server.registerTool(
    'tvcmall_batch_get_tracking',
    { title: 'TVCMall Batch Get Tracking', description: '用于批量查询多个订单的物流和订单运费；只有单个订单时，使用 tvcmall_get_tracking_info。', inputSchema: BatchGetTrackingInputSchema, outputSchema: BatchTrackingOutputSchema },
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
