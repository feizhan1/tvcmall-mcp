import { describe, expect, it } from 'vitest';
import { createTvcMallClients } from '../../src/app/client-factory.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { HttpAuthClient } from '../../src/auth/http-auth-client.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';
import { HttpOrderClient } from '../../src/orders/http-order-client.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';
import { HttpPointsClient } from '../../src/points/http-points-client.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';
import { HttpShippingClient } from '../../src/shipping/http-shipping-client.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';
import { HttpTrackingClient } from '../../src/tracking/http-tracking-client.js';
import { HttpProductClient } from '../../src/products/http-product-client.js';

describe('createTvcMallClients', () => {
  it('uses fake clients by default', () => {
    const clients = createTvcMallClients({
      webApiBaseUrl: 'https://webapi.tvcmall.test',
      apiTimeoutMs: 15000,
      apiEnv: 'production',
      logLevel: 'info',
      dataSource: 'fake',
      mcpHost: '127.0.0.1',
      mcpPort: 3000,
      mcpPath: '/mcp',
    });

    expect(clients.authClient).toBeInstanceOf(FakeAuthClient);
    expect(clients.productClient).toBeInstanceOf(FakeProductClient);
    expect(clients.orderClient).toBeInstanceOf(FakeOrderClient);
    expect(clients.pointsClient).toBeInstanceOf(FakePointsClient);
    expect(clients.shippingClient).toBeInstanceOf(FakeShippingClient);
    expect(clients.trackingClient).toBeInstanceOf(FakeTrackingClient);
  });

  it('uses HTTP clients when TVCMall data source is real', () => {
    const clients = createTvcMallClients({
      webApiBaseUrl: 'https://webapi.tvcmall.test',
      apiTimeoutMs: 4321,
      apiEnv: 'production',
      logLevel: 'info',
      dataSource: 'real',
      mcpHost: '127.0.0.1',
      mcpPort: 3000,
      mcpPath: '/mcp',
    });

    expect(clients.authClient).toBeInstanceOf(HttpAuthClient);
    expect(clients.productClient).toBeInstanceOf(HttpProductClient);
    expect(clients.orderClient).toBeInstanceOf(HttpOrderClient);
    expect(clients.pointsClient).toBeInstanceOf(HttpPointsClient);
    expect(clients.shippingClient).toBeInstanceOf(HttpShippingClient);
    expect(clients.trackingClient).toBeInstanceOf(HttpTrackingClient);
    for (const client of Object.values(clients)) {
      expect((client as unknown as { baseUrl: string }).baseUrl).toBe('https://webapi.tvcmall.test');
    }
    for (const client of [
      clients.productClient,
      clients.orderClient,
      clients.pointsClient,
      clients.shippingClient,
      clients.trackingClient
    ]) {
      expect((client as unknown as { timeoutMs: number }).timeoutMs).toBe(4321);
    }
  });
});
