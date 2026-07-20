import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { RequestAuthContext } from '../../src/auth/request-auth-context.js';
import { createMcpHttpServer, type McpHttpServerOptions } from '../../src/http/mcp-http-server.js';

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    readonly sessionId: string;
    onclose?: () => void;

    constructor(options: { sessionIdGenerator: () => string }) {
      this.sessionId = options.sessionIdGenerator();
    }

    async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
      res.writeHead(200, { 'mcp-session-id': this.sessionId });
      res.end(JSON.stringify({ method: req.method }));
      if (req.method === 'DELETE') this.onclose?.();
    }
  }
}));

interface DispatchOptions {
  server?: ReturnType<typeof createMcpHttpServer>;
  method: string;
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
  it('does not require an API key verifier', () => {
    expect(() => createMcpHttpServer()).not.toThrow();
  });

  it('keeps the unauthenticated health endpoint available', async () => {
    const response = await dispatch({ method: 'GET', path: '/healthz' });

    expect(response.status).toBe(200);
    expect(response.body).toBe(JSON.stringify({ status: 'ok' }));
  });

  it.each([
    ['missing authorization', undefined],
    ['Basic authorization', 'Basic tmcp_v1_token-id.secret-value'],
    ['website token', 'Bearer website-token'],
    ['invalid tmcp format', 'Bearer tmcp_v1_missing-secret.']
  ])('rejects %s with a stable error that does not expose the credential', async (_label, authorization) => {
    const response = await dispatch({
      method: 'POST',
      authorization,
      body: initializeRequest()
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    if (authorization) expect(response.body).not.toContain(authorization);
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
      authorization: `Bearer ${pat}`,
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
      authorization: `Bearer ${pat}`,
      body: initializeRequest()
    });
    const sessionId = initialized.headers['mcp-session-id'];

    for (const method of ['POST', 'GET', 'DELETE']) {
      const response = await dispatch({
        server,
        method,
        authorization: `Bearer ${pat}`,
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
      authorization: `Bearer ${firstPat}`,
      body: initializeRequest()
    });

    const response = await dispatch({
      server,
      method,
      authorization: pat ? `Bearer ${pat}` : undefined,
      sessionId: initialized.headers['mcp-session-id'],
      body: method === 'POST' ? { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } : undefined
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    expect(response.body).not.toContain(firstPat);
    if (pat) expect(response.body).not.toContain(pat);
  });
});

async function dispatch(options: DispatchOptions): Promise<DispatchResult> {
  const server = options.server ?? createMcpHttpServer();
  const serializedBody = options.body === undefined ? '' : JSON.stringify(options.body);
  const request = Readable.from(serializedBody ? [serializedBody] : []) as IncomingMessage;
  Object.assign(request, {
    headers: {
      ...(options.authorization ? { authorization: options.authorization } : {}),
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

function createTestServer(onAuthContext?: (authContext: RequestAuthContext) => void): ReturnType<typeof createMcpHttpServer> {
  const options: McpHttpServerOptions = {
    createMcpServer(authContext) {
      onAuthContext?.(authContext);
      return { connect: async () => undefined } as never;
    }
  };
  return createMcpHttpServer(options);
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
