import { describe, expect, it } from 'vitest';
import { createTvcMallClients } from '../../src/app/client-factory.js';
import { FakeAuthClient } from '../../src/auth/fake-auth-client.js';
import { HttpAuthClient } from '../../src/auth/http-auth-client.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';
import { HttpOrderClient } from '../../src/orders/http-order-client.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';
import { HttpPointsClient } from '../../src/points/http-points-client.js';
import { FakeProductClient } from '../../src/products/fake-product-client.js';
import { HttpProductClient } from '../../src/products/http-product-client.js';

describe('createTvcMallClients', () => {
  it('uses fake clients by default', () => {
    const clients = createTvcMallClients({
      apiBaseUrl: 'https://api.tvcmall.test',
      apiTimeoutMs: 15000,
      apiEnv: 'production',
      logLevel: 'info',
      dataSource: 'fake'
    });

    expect(clients.authClient).toBeInstanceOf(FakeAuthClient);
    expect(clients.productClient).toBeInstanceOf(FakeProductClient);
    expect(clients.orderClient).toBeInstanceOf(FakeOrderClient);
    expect(clients.pointsClient).toBeInstanceOf(FakePointsClient);
  });

  it('uses HTTP clients when TVCMall data source is real', () => {
    const clients = createTvcMallClients({
      apiBaseUrl: 'https://api.tvcmall.test',
      apiTimeoutMs: 15000,
      apiEnv: 'production',
      logLevel: 'info',
      dataSource: 'real'
    });

    expect(clients.authClient).toBeInstanceOf(HttpAuthClient);
    expect(clients.productClient).toBeInstanceOf(HttpProductClient);
    expect(clients.orderClient).toBeInstanceOf(HttpOrderClient);
    expect(clients.pointsClient).toBeInstanceOf(HttpPointsClient);
  });
});
