import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { RequestAuthContext } from '../../src/auth/request-auth-context.js';
import { createMcpHttpServer, type McpHttpServerOptions } from '../../src/http/mcp-http-server.js';

const FIRST_PAT = 'tmcp_v1_first.secret-value';
const SECOND_PAT = 'tmcp_v1_second.other-secret';
const servers: ReturnType<typeof createMcpHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }));
});

describe('Streamable HTTP MCP server', () => {
  it.each([
    ['missing authorization', undefined],
    ['Basic authorization', `Basic ${FIRST_PAT}`],
    ['website token', 'Bearer website-token'],
    ['invalid tmcp format', 'Bearer tmcp_v1_missing-secret.']
  ])('rejects %s before accepting an initialize request', async (_label, authorization) => {
    const baseUrl = await startServer();
    const response = await initialize(baseUrl, authorization);
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    if (authorization) expect(body).not.toContain(authorization);
  });

  it('creates a stateful session from a valid PAT and forwards its auth context', async () => {
    let receivedAuthContext: RequestAuthContext | undefined;
    const baseUrl = await startServer({
      createMcpServer(authContext) {
        receivedAuthContext = authContext;
        return new McpServer({ name: 'pat-http-test', version: '1' });
      }
    });

    const initializeResponse = await initialize(baseUrl, `Bearer ${FIRST_PAT}`);
    const sessionId = initializeResponse.headers.get('mcp-session-id');
    expect(initializeResponse.status).toBe(200);
    expect(sessionId).toBeTruthy();
    expect(receivedAuthContext).toEqual({
      pat: FIRST_PAT,
      patFingerprint: createHash('sha256').update(FIRST_PAT).digest('hex')
    });

    const listToolsResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: sessionHeaders(FIRST_PAT, sessionId!),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });

    expect(listToolsResponse.status).toBe(200);
    expect(await listToolsResponse.text()).not.toContain(FIRST_PAT);
  });

  it.each([
    ['POST', undefined],
    ['GET', undefined],
    ['DELETE', undefined],
    ['POST', SECOND_PAT],
    ['GET', SECOND_PAT],
    ['DELETE', SECOND_PAT]
  ])('requires the session PAT for a subsequent %s request (%s)', async (method, pat) => {
    const baseUrl = await startServer({
      createMcpServer: () => new McpServer({ name: 'pat-http-test', version: '1' })
    });
    const initializeResponse = await initialize(baseUrl, `Bearer ${FIRST_PAT}`);
    const sessionId = initializeResponse.headers.get('mcp-session-id');
    expect(initializeResponse.status).toBe(200);
    expect(sessionId).toBeTruthy();

    const response = await fetch(baseUrl, {
      method,
      headers: requestHeaders(pat, sessionId!),
      body: method === 'POST'
        ? JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        : undefined
    });
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(body)).toEqual({ error: { code: 'AUTH_REQUIRED' } });
    expect(body).not.toContain(FIRST_PAT);
    expect(body).not.toContain(SECOND_PAT);
  });
});

async function startServer(options: McpHttpServerOptions = {}): Promise<string> {
  const server = createMcpHttpServer(options);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/mcp`;
}

function initialize(baseUrl: string, authorization?: string): Promise<Response> {
  return fetch(baseUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
        protocolVersion: '2024-11-05'
      }
    })
  });
}

function requestHeaders(pat: string | undefined, sessionId: string): Record<string, string> {
  return {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-session-id': sessionId,
    ...(pat ? { authorization: `Bearer ${pat}` } : {})
  };
}

function sessionHeaders(pat: string, sessionId: string): Record<string, string> {
  return requestHeaders(pat, sessionId);
}
