import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthClient } from '../auth/auth-client.js';
import type { OrderClient } from '../orders/order-client.js';
import type { PointsClient } from '../points/points-client.js';
import type { ProductClient } from '../products/product-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import type { TokenStore } from '../storage/token-store.js';
import type { TrackingClient } from '../tracking/tracking-client.js';
import { AuthStatusOutputSchema, createAuthStatusToolResult } from '../tools/auth-status.js';
import { ExportOrdersInputSchema, ExportOrdersOutputSchema, exportOrdersForMcp } from '../tools/export-orders.js';
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
  tokenStore: TokenStore;
  authClient: AuthClient;
  productClient: ProductClient;
  pointsClient: PointsClient;
  shippingClient: ShippingClient;
  orderClient: OrderClient;
  trackingClient: TrackingClient;
}

export function registerTvcMallTools(server: McpServer, dependencies: RegisterToolDependencies): void {
  const { tokenStore, authClient, productClient, pointsClient, shippingClient, orderClient, trackingClient } = dependencies;

  server.registerTool(
    'tvcmall_auth_status',
    { title: 'TVCMall Auth Status', description: '检查当前 TVCMall MCP 是否已登录', inputSchema: z.object({}), outputSchema: AuthStatusOutputSchema },
    async () => createAuthStatusToolResult(tokenStore, { authClient })
  );

  server.registerTool(
    'tvcmall_search_products',
    { title: 'TVCMall Search Products', description: '使用假数据搜索 TVCMall 商品，后续替换为真实商品 API', inputSchema: SearchProductsInputSchema, outputSchema: SearchProductsOutputSchema },
    async (input) => searchProductsForMcp(input, { tokenStore, authClient, productClient })
  );

  server.registerTool(
    'tvcmall_get_product_detail',
    { title: 'TVCMall Get Product Detail', description: '使用假数据查看 TVCMall 商品详情，后续替换为真实商品详情 API', inputSchema: GetProductDetailInputSchema, outputSchema: ProductDetailSchema },
    async (input) => getProductDetailForMcp(input, { tokenStore, authClient, productClient })
  );

  server.registerTool(
    'tvcmall_get_points',
    { title: 'TVCMall Get Points', description: '查询当前客户 TVCMall 积分', inputSchema: GetPointsInputSchema, outputSchema: PointsStatOutputSchema },
    async (input) => getPointsForMcp(input, { tokenStore, authClient, pointsClient })
  );

  server.registerTool(
    'tvcmall_list_point_records',
    { title: 'TVCMall List Point Records', description: '查询当前客户 TVCMall 积分获取和使用记录', inputSchema: ListPointRecordsInputSchema, outputSchema: ListPointRecordsOutputSchema },
    async (input) => listPointRecordsForMcp(input, { tokenStore, authClient, pointsClient })
  );

  server.registerTool(
    'tvcmall_estimate_shipping',
    { title: 'TVCMall Estimate Shipping', description: '按商品 SKU、数量和目的国家预估未下单商品运费；如果用户提供订单号并询问订单运费、物流费用、shipping fee、freight 或 delivery cost，请不要调用本工具，必须使用 tvcmall_get_tracking_info。', inputSchema: EstimateShippingInputSchema, outputSchema: EstimateShippingOutputSchema },
    async (input) => estimateShippingForMcp(input, { tokenStore, authClient, shippingClient })
  );

  server.registerTool(
    'tvcmall_list_orders',
    { title: 'TVCMall List Orders', description: '使用假数据查询 TVCMall 订单列表，后续替换为真实订单 API', inputSchema: ListOrdersInputSchema, outputSchema: ListOrdersOutputSchema },
    async (input) => listOrdersForMcp(input, { tokenStore, authClient, orderClient })
  );

  server.registerTool(
    'tvcmall_get_order_detail',
    { title: 'TVCMall Get Order Detail', description: '查询 TVCMall 订单商品、金额、地址等详情；订单物流和运费查询请使用 tvcmall_get_tracking_info。', inputSchema: GetOrderDetailInputSchema, outputSchema: OrderDetailOutputSchema },
    async (input) => getOrderDetailForMcp(input, { tokenStore, authClient, orderClient })
  );

  server.registerTool(
    'tvcmall_get_tracking_info',
    { title: 'TVCMall Get Tracking Info', description: '查询单个 TVCMall 订单的物流和运费信息。当用户询问订单物流、物流轨迹、运费、shipping fee、freight、delivery cost 时，优先使用本工具。', inputSchema: GetTrackingInfoInputSchema, outputSchema: TrackingInfoOutputSchema },
    async (input) => getTrackingInfoForMcp(input, { tokenStore, authClient, trackingClient })
  );

  server.registerTool(
    'tvcmall_batch_get_tracking',
    { title: 'TVCMall Batch Get Tracking', description: '批量查询 TVCMall 订单物流和运费信息；单个订单物流或运费优先使用 tvcmall_get_tracking_info。', inputSchema: BatchGetTrackingInputSchema, outputSchema: BatchTrackingOutputSchema },
    async (input) => batchGetTrackingForMcp(input, { tokenStore, authClient, trackingClient })
  );

  server.registerTool(
    'tvcmall_export_orders',
    { title: 'TVCMall Export Orders', description: '使用假订单数据导出 CSV 文件，xlsx 暂未实现', inputSchema: ExportOrdersInputSchema, outputSchema: ExportOrdersOutputSchema },
    async (input) => exportOrdersForMcp(input, { tokenStore, authClient, orderClient })
  );
}
