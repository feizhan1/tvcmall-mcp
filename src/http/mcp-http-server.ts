import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPatAuthContext, type RequestAuthContext } from '../auth/request-auth-context.js';
import { createTvcMallMcpServer } from '../server.js';
import { sendHttpError } from './http-errors.js';
import { readJsonBody } from './request-body.js';

interface Session {
  patFingerprint: string;
  transport: StreamableHTTPServerTransport;
}

export interface McpHttpServerOptions {
  mcpPath?: string;
  createMcpServer?: (authContext: RequestAuthContext) => McpServer;
}

export function createMcpHttpServer(options: McpHttpServerOptions = {}): Server {
  const sessions = new Map<string, Session>();
  const mcpPath = options.mcpPath ?? '/mcp';
  const createMcpServer = options.createMcpServer ?? ((authContext) => createTvcMallMcpServer({ authContext }));

  return createServer(async (req, res) => {
    try {
      if (req.url === '/healthz' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== mcpPath) {
        sendHttpError(res, 404, 'NOT_FOUND');
        return;
      }

      const pat = readBearerPat(req);
      if (!pat) {
        sendHttpError(res, 401, 'AUTH_REQUIRED');
        return;
      }
      let authContext: RequestAuthContext;
      try {
        authContext = createPatAuthContext(pat);
      } catch {
        sendHttpError(res, 401, 'AUTH_REQUIRED');
        return;
      }

      const sessionId = req.headers['mcp-session-id'];
      if (typeof sessionId === 'string') {
        const session = sessions.get(sessionId);
        if (!session) {
          sendHttpError(res, 404, 'SESSION_NOT_FOUND');
          return;
        }
        if (session.patFingerprint !== authContext.patFingerprint) {
          sendHttpError(res, 401, 'AUTH_REQUIRED');
          return;
        }
        await session.transport.handleRequest(req, res, req.method === 'POST' ? await readJsonBody(req) : undefined);
        return;
      }

      if (req.method !== 'POST') {
        sendHttpError(res, 400, 'SESSION_REQUIRED');
        return;
      }
      const body = await readJsonBody(req);
      if (!isInitializeRequest(body)) {
        sendHttpError(res, 400, 'INITIALIZE_REQUIRED');
        return;
      }

      const id = randomUUID();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => id });
      sessions.set(id, { patFingerprint: authContext.patFingerprint, transport });
      transport.onclose = () => sessions.delete(id);
      const server = createMcpServer(authContext);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (res.headersSent) return;
      sendHttpError(res, 400, 'INVALID_REQUEST');
    }
  });
}

export async function startMcpHttpServer(options: McpHttpServerOptions & { host: string; port: number }): Promise<Server> {
  const server = createMcpHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function readBearerPat(req: IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const pat = authorization.slice('Bearer '.length).trim();
  return pat || undefined;
}

function isInitializeRequest(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize';
}
