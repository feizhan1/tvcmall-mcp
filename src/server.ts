import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTvcMallClients } from './app/client-factory.js';
import { registerTvcMallTools } from './app/register-tools.js';
import type { AuthClient } from './auth/auth-client.js';
import type { OrderClient } from './orders/order-client.js';
import type { PointsClient } from './points/points-client.js';
import type { ProductClient } from './products/product-client.js';
import type { ShippingClient } from './shipping/shipping-client.js';
import type { TrackingClient } from './tracking/tracking-client.js';
import type { TokenStore } from './storage/token-store.js';
import { createDefaultTokenStore } from './storage/token-store.js';
import { PACKAGE_VERSION } from './version.js';

export interface ServerOptions {
  tokenStore?: TokenStore;
  authClient?: AuthClient;
  productClient?: ProductClient;
  pointsClient?: PointsClient;
  shippingClient?: ShippingClient;
  orderClient?: OrderClient;
  trackingClient?: TrackingClient;
}

export function createTvcMallMcpServer(options: ServerOptions = {}): McpServer {
  const tokenStore = options.tokenStore ?? createDefaultTokenStore();
  const defaultClients = createTvcMallClients();
  const authClient = options.authClient ?? defaultClients.authClient;
  const productClient = options.productClient ?? defaultClients.productClient;
  const pointsClient = options.pointsClient ?? defaultClients.pointsClient;
  const shippingClient = options.shippingClient ?? defaultClients.shippingClient;
  const orderClient = options.orderClient ?? defaultClients.orderClient;
  const trackingClient = options.trackingClient ?? defaultClients.trackingClient;
  const server = new McpServer({ name: 'tvcmall-mcp', version: PACKAGE_VERSION });

  registerTvcMallTools(server, { tokenStore, authClient, productClient, pointsClient, shippingClient, orderClient, trackingClient });

  return server;
}

export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const server = createTvcMallMcpServer(options);
  await server.connect(new StdioServerTransport());
}
