import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { BaseHttpClient, type JsonObject } from '../../src/api/http-client.js';
import { registerTvcMallTools } from '../../src/app/register-tools.js';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';
import type { ProductClient, ProductSearchInput } from '../../src/products/product-client.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const upstreamBodySecret = 'upstream-sensitive-error-detail';

class TestHttpClient extends BaseHttpClient {
  async get(): Promise<JsonObject> {
    const response = await this.fetchImpl(this.createUrl('/test'));
    return this.readJson(response, 'TVCMall test request');
  }
}

describe('BaseHttpClient WebApi errors', () => {
  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'PERMISSION_DENIED'],
    [429, 'RATE_LIMITED'],
    [400, 'API_UNAVAILABLE'],
    [503, 'API_UNAVAILABLE']
  ] as const)('maps HTTP %s without reading or exposing its response body', async (status, code) => {
    const json = vi.fn(async () => ({ detail: upstreamBodySecret }));
    const text = vi.fn(async () => upstreamBodySecret);
    const fetchImpl = vi.fn(async () => ({ ok: false, status, json, text }) as unknown as Response);
    const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch });

    let error: unknown;
    try {
      await client.get();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain(upstreamBodySecret);
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('maps network and timeout failures without exposing the original error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`request timed out for ${pat}`);
    });
    const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch });

    let error: unknown;
    try {
      await client.get();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'API_UNAVAILABLE' });
    expect(String(error)).not.toContain(pat);
  });

  it('maps response body read failures without exposing the original error', async () => {
    const json = vi.fn(async () => {
      throw new TypeError(`response body interrupted for ${pat}: ${upstreamBodySecret}`);
    });
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json }) as unknown as Response);
    const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch });

    let error: unknown;
    try {
      await client.get();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'API_UNAVAILABLE' });
    expect(String(error)).not.toContain(pat);
    expect(String(error)).not.toContain(upstreamBodySecret);
  });
});

describe('registered tool WebApi error wrapper', () => {
  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'PERMISSION_DENIED'],
    [429, 'RATE_LIMITED'],
    [503, 'API_UNAVAILABLE']
  ] as const)('maps WebApi HTTP %s to %s', async (status, code) => {
    const upstreamError = await captureHttpError(status);
    const result = await callSearchProductsTool(upstreamError);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain(code);
    expect(JSON.stringify(result)).not.toContain(upstreamBodySecret);
    expect(JSON.stringify(result)).not.toContain(pat);
  });

  it('does not expose PAT values from unknown errors', async () => {
    const result = await callSearchProductsTool(new Error(`unexpected client failure: ${pat}`));

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('API_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain(pat);
  });
});

async function captureHttpError(status: number): Promise<unknown> {
  const fetchImpl = vi.fn(async () => ({
    ok: false,
    status,
    json: vi.fn(async () => ({ detail: upstreamBodySecret })),
    text: vi.fn(async () => upstreamBodySecret)
  }) as unknown as Response);
  const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch });

  try {
    await client.get();
  } catch (error) {
    return error;
  }
  throw new Error(`Expected HTTP ${status} to fail`);
}

async function callSearchProductsTool(error: unknown): Promise<CallToolResult> {
  const callbacks = new Map<string, (input: unknown) => Promise<CallToolResult>>();
  const server = {
    registerTool(name: string, _config: unknown, callback: (input: unknown) => Promise<CallToolResult>) {
      callbacks.set(name, callback);
    }
  } as unknown as McpServer;
  const productClient: ProductClient = {
    async searchProducts(_input: ProductSearchInput, _session: StoredAuthSession) {
      throw error;
    },
    async getProductDetail() {
      throw error;
    }
  };

  registerTvcMallTools(server, {
    authContext: createPatAuthContext(pat),
    productClient,
    pointsClient: new FakePointsClient(),
    shippingClient: new FakeShippingClient(),
    orderClient: new FakeOrderClient(),
    trackingClient: new FakeTrackingClient()
  });

  const callback = callbacks.get('tvcmall_search_products');
  if (!callback) throw new Error('Search products tool was not registered');
  return callback({ query: 'case', page: 1, page_size: 20 });
}
