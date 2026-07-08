import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTvcMallTools } from './app/register-tools.js';
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

  registerTvcMallTools(server, { tokenStore, authClient, productClient, shippingClient, orderClient, trackingClient });

  return server;
}

export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const server = createTvcMallMcpServer(options);
  await server.connect(new StdioServerTransport());
}
