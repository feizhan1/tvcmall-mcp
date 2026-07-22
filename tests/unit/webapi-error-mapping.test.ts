import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { BaseHttpClient, type JsonObject } from '../../src/api/http-client.js';
import { registerTvcMallTools } from '../../src/app/register-tools.js';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { FakeBalanceClient } from '../../src/balance/fake-balance-client.js';
import { FakeOrderClient } from '../../src/orders/fake-order-client.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';
import type { ProductClient, ProductSearchInput } from '../../src/products/product-client.js';
import { FakeShippingClient } from '../../src/shipping/fake-shipping-client.js';
import type { StoredAuthSession } from '../../src/storage/token-store.js';
import { FakeTrackingClient } from '../../src/tracking/fake-tracking-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const upstreamBodySecret = 'upstream-sensitive-error-detail';

class TestHttpClient extends BaseHttpClient {
  async get(signal?: AbortSignal): Promise<JsonObject> {
    const response = await this.fetchImpl(this.createUrl('/test'), { signal });
    return this.readJson(response, 'TVCMall test request');
  }

  async getRequest(request: Request): Promise<JsonObject> {
    const response = await this.fetchImpl(request);
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
    const cancel = vi.fn(async () => {
      throw new Error(`body cancellation failed for ${pat}: ${upstreamBodySecret}`);
    });
    const fetchImpl = vi.fn(async () => ({ ok: false, status, body: { cancel }, json, text }) as unknown as Response);
    const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch });

    let error: unknown;
    try {
      await client.get();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain(upstreamBodySecret);
    expect(String(error)).not.toContain(pat);
    expect(cancel).toHaveBeenCalledOnce();
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

  it('aborts a request that does not return headers and maps the timeout safely', async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      let rejectPending: ((reason?: unknown) => void) | undefined;
      const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        rejectPending = reject;
        observedSignal = init?.signal ?? undefined;
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException(`request aborted for ${pat}: ${upstreamBodySecret}`, 'AbortError'));
        }, { once: true });
      }));
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 25 });

      const result = client.get().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(25);
      const wasAborted = observedSignal?.aborted === true;
      if (!wasAborted) rejectPending?.(new DOMException('test cleanup', 'AbortError'));
      const error = await result;

      expect(wasAborted).toBe(true);
      expect(error).toMatchObject({ code: 'API_UNAVAILABLE', message: 'API_UNAVAILABLE' });
      expect(String(error)).not.toContain(pat);
      expect(String(error)).not.toContain(upstreamBodySecret);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timeout active until response JSON reading completes', async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      let rejectBody: ((reason?: unknown) => void) | undefined;
      const json = vi.fn(() => new Promise<unknown>((_resolve, reject) => {
        rejectBody = reject;
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException(`body aborted for ${pat}: ${upstreamBodySecret}`, 'AbortError'));
        }, { once: true });
      }));
      const fetchImpl = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return { ok: true, status: 200, json } as unknown as Response;
      });
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 25 });

      const result = client.get().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(json).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(25);
      const wasAborted = observedSignal?.aborted === true;
      if (!wasAborted) rejectBody?.(new DOMException('test cleanup', 'AbortError'));
      const error = await result;

      expect(wasAborted).toBe(true);
      expect(error).toMatchObject({ code: 'API_UNAVAILABLE', message: 'API_UNAVAILABLE' });
      expect(String(error)).not.toContain(pat);
      expect(String(error)).not.toContain(upstreamBodySecret);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the timeout after a successful body read', async () => {
    vi.useFakeTimers();
    try {
      const abortListener = vi.fn();
      const fetchImpl = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', abortListener);
        return { ok: true, status: 200, json: vi.fn(async () => ({ ok: true })) } as unknown as Response;
      });
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 25 });

      await expect(client.get()).resolves.toEqual({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(25);
      expect(abortListener).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves caller cancellation and clears its timeout after abort', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('caller aborted', 'AbortError')), { once: true });
      }));
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 100 });
      const callerController = new AbortController();

      const result = client.get(callerController.signal).catch((error: unknown) => error);
      callerController.abort();
      const error = await result;

      expect(error).toMatchObject({ code: 'API_UNAVAILABLE', message: 'API_UNAVAILABLE' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves cancellation from a Request signal', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('request aborted', 'AbortError')), { once: true });
      }));
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 100 });
      const callerController = new AbortController();
      const request = new Request('https://webapi.test/test', { signal: callerController.signal });

      const result = client.getRequest(request).catch((error: unknown) => error);
      callerController.abort();
      const error = await result;

      expect(error).toMatchObject({ code: 'API_UNAVAILABLE', message: 'API_UNAVAILABLE' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates timeout cancellation between concurrent requests', async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) throw new Error('Expected a request signal');
        signals.push(signal);
        if (signals.length === 1) {
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), { once: true });
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn(async () => ({ request: 'completed' }))
        } as unknown as Response);
      });
      const client = new TestHttpClient({ baseUrl: 'https://webapi.test', fetch: fetchImpl as typeof fetch, timeoutMs: 25 });

      const timedOut = client.get().catch((error: unknown) => error);
      await expect(client.get()).resolves.toEqual({ request: 'completed' });
      await vi.advanceTimersByTimeAsync(25);

      await expect(timedOut).resolves.toMatchObject({ code: 'API_UNAVAILABLE', message: 'API_UNAVAILABLE' });
      expect(signals[0]).not.toBe(signals[1]);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe timeoutMs %s without echoing its value',
    (timeoutMs) => {
      expect(() => new TestHttpClient({ baseUrl: 'https://webapi.test', timeoutMs }))
        .toThrowError('HTTP client timeoutMs must be a positive safe integer');
    }
  );

  it('accepts the maximum Node timer timeout', () => {
    expect(() => new TestHttpClient({ baseUrl: 'https://webapi.test', timeoutMs: 2_147_483_647 })).not.toThrow();
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
    balanceClient: new FakeBalanceClient(),
    pointsClient: new FakePointsClient(),
    shippingClient: new FakeShippingClient(),
    orderClient: new FakeOrderClient(),
    trackingClient: new FakeTrackingClient()
  });

  const callback = callbacks.get('tvcmall_search_products');
  if (!callback) throw new Error('Search products tool was not registered');
  return callback({ query: 'case', page: 1, page_size: 20 });
}
