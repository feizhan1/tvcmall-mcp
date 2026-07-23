import type { AuthClient } from '../auth/auth-client.js';
import { FakeAuthClient } from '../auth/fake-auth-client.js';
import { HttpAuthClient } from '../auth/http-auth-client.js';
import type { BalanceClient } from '../balance/balance-client.js';
import { FakeBalanceClient } from '../balance/fake-balance-client.js';
import { HttpBalanceClient } from '../balance/http-balance-client.js';
import type { TvcMallRuntimeConfig } from '../config/runtime-config.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import type { OrderClient } from '../orders/order-client.js';
import { FakeOrderClient } from '../orders/fake-order-client.js';
import { HttpOrderClient } from '../orders/http-order-client.js';
import type { PointsClient } from '../points/points-client.js';
import { FakePointsClient } from '../points/fake-points-client.js';
import { HttpPointsClient } from '../points/http-points-client.js';
import type { ProductClient } from '../products/product-client.js';
import { FakeProductClient } from '../products/fake-product-client.js';
import { HttpProductClient } from '../products/http-product-client.js';
import type { ShippingClient } from '../shipping/shipping-client.js';
import { FakeShippingClient } from '../shipping/fake-shipping-client.js';
import { HttpShippingClient } from '../shipping/http-shipping-client.js';
import type { TrackingClient } from '../tracking/tracking-client.js';
import { FakeTrackingClient } from '../tracking/fake-tracking-client.js';
import { HttpTrackingClient } from '../tracking/http-tracking-client.js';
import type { McpHttpLogger } from '../logging/mcp-http-logger.js';

export interface TvcMallClients {
  authClient: AuthClient;
  balanceClient: BalanceClient;
  productClient: ProductClient;
  pointsClient: PointsClient;
  shippingClient: ShippingClient;
  orderClient: OrderClient;
  trackingClient: TrackingClient;
}

export function createTvcMallClients(config: TvcMallRuntimeConfig = loadRuntimeConfig(), logger?: McpHttpLogger): TvcMallClients {
  if (config.dataSource === 'real') {
    const requestOptions = {
      baseUrl: config.webApiBaseUrl,
      onWebApiRequestCompleted: logger ? logger.webApiRequestCompleted.bind(logger) : undefined,
      timeoutMs: config.apiTimeoutMs
    };
    return {
      authClient: new HttpAuthClient({ baseUrl: config.webApiBaseUrl, authorization: config.apiAuthorization }),
      balanceClient: new HttpBalanceClient(requestOptions),
      productClient: new HttpProductClient(requestOptions),
      pointsClient: new HttpPointsClient(requestOptions),
      shippingClient: new HttpShippingClient(requestOptions),
      orderClient: new HttpOrderClient(requestOptions),
      trackingClient: new HttpTrackingClient(requestOptions)
    };
  }

  return {
    authClient: new FakeAuthClient(),
    balanceClient: new FakeBalanceClient(),
    productClient: new FakeProductClient(),
    pointsClient: new FakePointsClient(),
    shippingClient: new FakeShippingClient(),
    orderClient: new FakeOrderClient(),
    trackingClient: new FakeTrackingClient()
  };
}
