import type { AuthClient } from '../auth/auth-client.js';
import { FakeAuthClient } from '../auth/fake-auth-client.js';
import { HttpAuthClient } from '../auth/http-auth-client.js';
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

export interface TvcMallClients {
  authClient: AuthClient;
  productClient: ProductClient;
  pointsClient: PointsClient;
  shippingClient: ShippingClient;
  orderClient: OrderClient;
  trackingClient: TrackingClient;
}

export function createTvcMallClients(config: TvcMallRuntimeConfig = loadRuntimeConfig()): TvcMallClients {
  if (config.dataSource === 'real') {
    return {
      authClient: new HttpAuthClient({ baseUrl: config.apiBaseUrl, authorization: config.apiAuthorization }),
      productClient: new HttpProductClient({ baseUrl: config.apiBaseUrl }),
      pointsClient: new HttpPointsClient({ baseUrl: config.apiBaseUrl }),
      shippingClient: new HttpShippingClient({ baseUrl: config.apiBaseUrl }),
      orderClient: new HttpOrderClient({ baseUrl: config.apiBaseUrl }),
      trackingClient: new HttpTrackingClient({ baseUrl: config.apiBaseUrl })
    };
  }

  return {
    authClient: new FakeAuthClient(),
    productClient: new FakeProductClient(),
    pointsClient: new FakePointsClient(),
    shippingClient: new FakeShippingClient(),
    orderClient: new FakeOrderClient(),
    trackingClient: new FakeTrackingClient()
  };
}
