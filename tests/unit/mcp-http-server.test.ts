import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RequestAuthContext } from '../../src/auth/request-auth-context.js';
import { createMcpHttpServer, startMcpHttpServer, type McpHttpServerOptions } from '../../src/http/mcp-http-server.js';
import type { McpHttpLogger } from '../../src/logging/mcp-http-logger.js';

interface TransportDouble {
  close: Mock<() => Promise<void>>;
  handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void>;
  onclose?: () => void;
  sessionId?: string;
}

type TransportHandler = (transport: TransportDouble, req: IncomingMessage, res: ServerResponse, body?: unknown) => Promise<void>;

const transportHarness = vi.hoisted(() => ({
  handlers: [] as TransportHandler[],
  instances: [] as TransportDouble[]
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    readonly generatedSessionId: string;
    sessionId?: string;
    onclose?: () => void;
    close = vi.fn(async () => {
      this.onclose?.();
    });

    constructor(options: { sessionIdGenerator: () => string }) {
      this.generatedSessionId = options.sessionIdGenerator();
      transportHarness.instances.push(this);
    }

    async handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {
      const handler = transportHarness.handlers.shift();
      if (handler) return handler(this, req, res, body);
      if (isInitializeBody(body)) this.sessionId = this.generatedSessionId;
      res.writeHead(200, { 'mcp-session-id': this.generatedSessionId });
      res.end(JSON.stringify({ method: req.method }));
      if (req.method === 'DELETE') this.onclose?.();
    }
  }
}));

const createdServers: Server[] = [];

beforeEach(() => {
  transportHarness.handlers.length = 0;
  transportHarness.instances.length = 0;
});

afterEach(async () => {
  for (const server of createdServers.splice(0)) server.emit('close');
  await Promise.resolve();
  vi.useRealTimers();
});

interface DispatchOptions {
  server?: ReturnType<typeof createMcpHttpServer>;
  method: string;
  apiKey?: string | string[];
  authorization?: string;
  body?: unknown;
  path?: string;
  sessionId?: string;
}

interface DispatchResult {
  body: string;
  headers: Record<string, string>;
  status: number;
}

describe('createMcpHttpServer', () => {
  it('logs an initialized MCP request without its credential, session, or body', async () => {
    const logger = new RecordingLogger();
    const apiKey = 'tmcp_v1_logging-test.secret-value';

    await initialize(createTestServer({ logger }), apiKey);

    expect(logger.requests).toContainEqual(expect.objectContaining({
      httpMethod: 'POST',
      httpStatus: 200,
      jsonRpcMethod: 'initialize',
      requestType: 'mcp'
    }));
    expect(JSON.stringify(logger)).not.toContain(apiKey);
    expect(JSON.stringify(logger)).not.toContain('clientInfo');
    expect(JSON.stringify(logger)).not.toContain('secret-value');
  });

  it('logs a stable HTTP error code without the rejected credential', async () => {
    const logger = new RecordingLogger();
    const apiKey = 'tmcp_v1_invalid.secret-value';

    await dispatch({
      server: createTestServer({ logger }),
      method: 'POST',
      apiKey,
      authorization: 'Bearer legacy',
      body: initializeRequest()
    });

    expect(logger.requests).toContainEqual(expect.objectContaining({ httpStatus: 401, errorCode: 'AUTH_REQUIRED' }));
    expect(JSON.stringify(logger)).not.toContain(apiKey);
  });

  it('logs the resolved listening address when starting the HTTP server', async () => {
    const logger = new RecordingLogger();
    const server = await startMcpHttpServer({ host: '127.0.0.1', port: 0, logger });

    try {
      expect(logger.started).toEqual([expect.objectContaining({ host: '127.0.0.1', mcpPath: '/mcp', port: expect.any(Number) })]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('does not require an API key verifier', () => {
    expect(() => createMcpHttpServer()).not.toThrow();
  });

  it('keeps the unauthenticated health endpoint available', async () => {
    const response = await dispatch({ method: 'GET', path: '/healthz' });

    expect(response.status).toBe(200);
    expect(response.body).toBe(JSON.stringify({ status: 'ok' }));
  });

  it.each([
    ['missing API KEY', undefined],
    ['empty API KEY', ''],
    ['duplicate API KEY', ['tmcp_v1_first.secret', 'tmcp_v1_first.secret']],
    ['whitespace-padded API KEY', ' tmcp_v1_token-id.secret-value '],
    ['Bearer-prefixed API KEY', 'Bearer tmcp_v1_token-id.secret-value'],
    ['website token', 'website-token'],
    ['invalid tmcp format', 'tmcp_v1_missing-secret.']
  ])('rejects %s with a stable error that does not expose the credential', async (_label, apiKey) => {
    const server = createTestServer();
    const response = await dispatch({
      server,
      method: 'POST',
      apiKey,
      body: initializeRequest()
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    if (typeof apiKey === 'string' && apiKey) expect(response.body).not.toContain(apiKey);
  });

  it('rejects the removed Authorization input even when its PAT is valid', async () => {
    const response = await dispatch({
      method: 'POST',
      authorization: 'Bearer tmcp_v1_legacy.secret-value',
      body: initializeRequest()
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('rejects ambiguous requests carrying both credential headers', async () => {
    const response = await dispatch({
      method: 'POST',
      apiKey: 'tmcp_v1_current.secret-value',
      authorization: 'Bearer tmcp_v1_legacy.secret-value',
      body: initializeRequest()
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('creates a stateful session from a valid PAT and keeps its fingerprint', async () => {
    const pat = 'tmcp_v1_first.secret-value';
    let receivedAuthContext: RequestAuthContext | undefined;
    const server = createTestServer((authContext) => {
      receivedAuthContext = authContext;
    });

    const response = await dispatch({
      server,
      method: 'POST',
      apiKey: pat,
      body: initializeRequest()
    });

    expect(response.status).toBe(200);
    expect(response.headers['mcp-session-id']).toBeTruthy();
    expect(receivedAuthContext).toEqual({
      pat,
      patFingerprint: createHash('sha256').update(pat).digest('hex')
    });
  });

  it('accepts the same PAT on subsequent POST, GET, and DELETE requests', async () => {
    const pat = 'tmcp_v1_first.secret-value';
    const server = createTestServer();
    const initialized = await dispatch({
      server,
      method: 'POST',
      apiKey: pat,
      body: initializeRequest()
    });
    const sessionId = initialized.headers['mcp-session-id'];

    for (const method of ['POST', 'GET', 'DELETE']) {
      const response = await dispatch({
        server,
        method,
        apiKey: pat,
        sessionId,
        body: method === 'POST' ? { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } : undefined
      });
      expect(response.status).toBe(200);
    }
  });

  it.each([
    ['POST', undefined],
    ['GET', undefined],
    ['DELETE', undefined],
    ['POST', 'tmcp_v1_second.other-secret'],
    ['GET', 'tmcp_v1_second.other-secret'],
    ['DELETE', 'tmcp_v1_second.other-secret']
  ])('rejects a missing or replaced PAT on a session %s request (%s)', async (method, pat) => {
    const firstPat = 'tmcp_v1_first.secret-value';
    const server = createTestServer();
    const initialized = await dispatch({
      server,
      method: 'POST',
      apiKey: firstPat,
      body: initializeRequest()
    });

    const response = await dispatch({
      server,
      method,
      apiKey: pat,
      sessionId: initialized.headers['mcp-session-id'],
      body: method === 'POST' ? { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } : undefined
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    expect(response.body).not.toContain(firstPat);
    if (pat) expect(response.body).not.toContain(pat);
  });

  it('releases capacity and closes the transport when server.connect fails', async () => {
    const server = createTestServer({
      maxSessions: 1,
      connect: async (index) => {
        if (index === 0) throw new Error('connect failed');
      }
    });

    const failed = await initialize(server, 'tmcp_v1_failed.secret');
    const succeeded = await initialize(server, 'tmcp_v1_succeeded.secret');

    expect(failed.status).toBe(400);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(succeeded.status).toBe(200);
  });

  it('releases capacity and closes the connection when initialize handling fails', async () => {
    transportHarness.handlers.push(async () => {
      throw new Error('initialize failed');
    });
    const server = createTestServer({ maxSessions: 1 });

    const failed = await initialize(server, 'tmcp_v1_failed.secret');
    const succeeded = await initialize(server, 'tmcp_v1_succeeded.secret');

    expect(failed.status).toBe(400);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(succeeded.status).toBe(200);
  });

  it('does not retain a session when initialize returns a non-success response', async () => {
    transportHarness.handlers.push(async (_transport, _req, res) => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid initialize' }));
    });
    const server = createTestServer({ maxSessions: 1 });

    const failed = await initialize(server, 'tmcp_v1_failed.secret');
    const succeeded = await initialize(server, 'tmcp_v1_succeeded.secret');

    expect(failed.status).toBe(400);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(succeeded.status).toBe(200);
  });

  it('rejects new sessions at capacity without disrupting an existing session', async () => {
    const firstPat = 'tmcp_v1_first.secret';
    const secondPat = 'tmcp_v1_second.secret';
    const server = createTestServer({ maxSessions: 1 });
    const initialized = await initialize(server, firstPat);

    const rejected = await initialize(server, secondPat);
    const existing = await dispatch({
      server,
      method: 'POST',
      apiKey: firstPat,
      sessionId: initialized.headers['mcp-session-id'],
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    });

    expect(rejected.status).toBe(503);
    expect(JSON.parse(rejected.body)).toEqual({ error: { code: 'SESSION_CAPACITY_REACHED' } });
    expect(rejected.body).not.toContain(secondPat);
    expect(existing.status).toBe(200);
  });

  it('counts pending initializations against session capacity', async () => {
    let releaseConnect!: () => void;
    let signalConnectStarted!: () => void;
    const connectStarted = new Promise<void>((resolve) => {
      signalConnectStarted = resolve;
    });
    const connectPending = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const server = createTestServer({
      maxSessions: 1,
      connect: async (index) => {
        if (index === 0) {
          signalConnectStarted();
          await connectPending;
        }
      }
    });

    const firstResponse = initialize(server, 'tmcp_v1_pending.secret');
    await connectStarted;
    const rejected = await initialize(server, 'tmcp_v1_racing.secret');
    releaseConnect();

    expect(rejected.status).toBe(503);
    expect(await firstResponse).toMatchObject({ status: 200 });
  });

  it('expires an idle session, closes its transport, and returns 404 afterwards', async () => {
    vi.useFakeTimers();
    const pat = 'tmcp_v1_idle.secret';
    const server = createTestServer({ sessionIdleTtlMs: 100 });
    const initialized = await initialize(server, pat);
    const sessionId = initialized.headers['mcp-session-id'];

    await vi.advanceTimersByTimeAsync(100);
    const expired = await dispatch({ server, method: 'POST', apiKey: pat, sessionId, body: {} });

    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(expired.status).toBe(404);
    expect(JSON.parse(expired.body)).toEqual({ error: { code: 'SESSION_NOT_FOUND' } });
  });

  it('refreshes the idle TTL after an active request completes', async () => {
    vi.useFakeTimers();
    const pat = 'tmcp_v1_active.secret';
    const server = createTestServer({ sessionIdleTtlMs: 100 });
    const initialized = await initialize(server, pat);
    const sessionId = initialized.headers['mcp-session-id'];

    await vi.advanceTimersByTimeAsync(90);
    const active = await dispatch({ server, method: 'POST', apiKey: pat, sessionId, body: {} });
    await vi.advanceTimersByTimeAsync(99);

    expect(active.status).toBe(200);
    expect(transportHarness.instances[0]?.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'tmcp_v1_replaced.secret'])('does not refresh idle TTL for a missing or mismatched PAT (%s)', async (pat) => {
    vi.useFakeTimers();
    const originalPat = 'tmcp_v1_original.secret';
    const server = createTestServer({ sessionIdleTtlMs: 100 });
    const initialized = await initialize(server, originalPat);
    const sessionId = initialized.headers['mcp-session-id'];

    await vi.advanceTimersByTimeAsync(90);
    const rejected = await dispatch({
      server,
      method: 'POST',
      apiKey: pat,
      sessionId,
      body: {}
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(rejected.status).toBe(401);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('does not expire a session while an authenticated request is running', async () => {
    vi.useFakeTimers();
    const pat = 'tmcp_v1_running.secret';
    const server = createTestServer({ sessionIdleTtlMs: 100 });
    const initialized = await initialize(server, pat);
    const sessionId = initialized.headers['mcp-session-id'];
    let releaseRequest!: () => void;
    let signalRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      signalRequestStarted = resolve;
    });
    const requestPending = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    transportHarness.handlers.push(async (_transport, req, res) => {
      signalRequestStarted();
      await requestPending;
      res.writeHead(200);
      res.end(JSON.stringify({ method: req.method }));
    });

    await vi.advanceTimersByTimeAsync(90);
    const activeResponse = dispatch({ server, method: 'POST', apiKey: pat, sessionId, body: {} });
    await requestStarted;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transportHarness.instances[0]?.close).not.toHaveBeenCalled();

    releaseRequest();
    expect((await activeResponse).status).toBe(200);
    await vi.advanceTimersByTimeAsync(99);
    expect(transportHarness.instances[0]?.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('closes every session transport when the Node HTTP server closes', async () => {
    const server = createTestServer({ maxSessions: 2 });
    await initialize(server, 'tmcp_v1_first.secret');
    await initialize(server, 'tmcp_v1_second.secret');

    server.close(() => undefined);
    await Promise.resolve();

    expect(transportHarness.instances).toHaveLength(2);
    expect(transportHarness.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(transportHarness.instances[1]?.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    { maxSessions: 0 },
    { maxSessions: 1.5 },
    { maxSessions: Number.POSITIVE_INFINITY },
    { sessionIdleTtlMs: 0 },
    { sessionIdleTtlMs: Number.NaN },
    { sessionIdleTtlMs: 2_147_483_648 }
  ])('rejects invalid lifecycle option overrides: %o', (options) => {
    expect(() => createMcpHttpServer(options as McpHttpServerOptions)).toThrow(RangeError);
  });
});

async function dispatch(options: DispatchOptions): Promise<DispatchResult> {
  const server = options.server ?? trackServer(createMcpHttpServer());
  const serializedBody = options.body === undefined ? '' : JSON.stringify(options.body);
  const request = Readable.from(serializedBody ? [serializedBody] : []) as IncomingMessage;
  Object.assign(request, {
    headers: {
      ...(options.apiKey !== undefined ? { tvcmall_api_key: options.apiKey } : {}),
      ...(options.authorization !== undefined ? { authorization: options.authorization } : {}),
      ...(options.sessionId ? { 'mcp-session-id': options.sessionId } : {})
    },
    method: options.method,
    url: options.path ?? '/mcp'
  });

  return new Promise((resolve) => {
    let body = '';
    const headers: Record<string, string> = {};
    let headersSent = false;
    let status = 0;
    const response = {
      get headersSent() {
        return headersSent;
      },
      get statusCode() {
        return status || 200;
      },
      end(chunk?: string) {
        if (chunk) body += chunk;
        resolve({ body, headers, status });
      },
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        headersSent = true;
        status = nextStatus;
        Object.assign(headers, nextHeaders);
        return response;
      }
    } as unknown as ServerResponse;

    server.emit('request', request, response);
  });
}

interface TestServerOptions {
  connect?: (index: number) => Promise<void>;
  logger?: McpHttpLogger;
  maxSessions?: number;
  onAuthContext?: (authContext: RequestAuthContext) => void;
  sessionIdleTtlMs?: number;
}

function createTestServer(options: TestServerOptions | ((authContext: RequestAuthContext) => void) = {}): ReturnType<typeof createMcpHttpServer> {
  const normalizedOptions = typeof options === 'function' ? { onAuthContext: options } : options;
  let serverIndex = 0;
  const httpOptions = {
    createMcpServer(authContext) {
      normalizedOptions.onAuthContext?.(authContext);
      const index = serverIndex++;
      let transport: TransportDouble | undefined;
      return {
        async close() {
          await transport?.close();
        },
        async connect(nextTransport: TransportDouble) {
          transport = nextTransport;
          await normalizedOptions.connect?.(index);
        }
      } as never;
    },
    logger: normalizedOptions.logger,
    maxSessions: normalizedOptions.maxSessions,
    sessionIdleTtlMs: normalizedOptions.sessionIdleTtlMs
  } as McpHttpServerOptions;
  return trackServer(createMcpHttpServer(httpOptions));
}

class RecordingLogger implements McpHttpLogger {
  readonly requests: Parameters<McpHttpLogger['requestCompleted']>[0][] = [];
  readonly started: Parameters<McpHttpLogger['serverStarted']>[0][] = [];

  requestCompleted(details: Parameters<McpHttpLogger['requestCompleted']>[0]): void {
    this.requests.push(details);
  }

  serverStarted(details: Parameters<McpHttpLogger['serverStarted']>[0]): void {
    this.started.push(details);
  }

  sessionEvent(): void {}

  toolCompleted(): void {}
}

function initialize(server: Server, pat: string): Promise<DispatchResult> {
  return dispatch({ server, method: 'POST', apiKey: pat, body: initializeRequest() });
}

function isInitializeBody(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize';
}

function trackServer(server: Server): Server {
  createdServers.push(server);
  return server;
}

function initializeRequest(): object {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
      protocolVersion: '2024-11-05'
    }
  };
}
