import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPatAuthContext, type RequestAuthContext } from '../auth/request-auth-context.js';
import { createMcpHttpLogger, NOOP_MCP_HTTP_LOGGER, type McpHttpErrorCode, type McpHttpLogger } from '../logging/mcp-http-logger.js';
import { createTvcMallMcpServer } from '../server.js';
import { sendHttpError } from './http-errors.js';
import { readJsonBody } from './request-body.js';

const DEFAULT_MAX_SESSIONS = 1_000;
const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

interface Session {
  activeRequests: number;
  closed: boolean;
  closing: boolean;
  connected: boolean;
  idleTimer?: NodeJS.Timeout;
  mcpServer: McpServer;
  patFingerprint: string;
  sessionId: string;
  transport: StreamableHTTPServerTransport;
}

export interface McpHttpServerOptions {
  mcpPath?: string;
  maxSessions?: number;
  sessionIdleTtlMs?: number;
  logger?: McpHttpLogger;
  createMcpServer?: (authContext: RequestAuthContext, logger: McpHttpLogger) => McpServer;
}

export function createMcpHttpServer(options: McpHttpServerOptions = {}): Server {
  const sessions = new Map<string, Session>();
  const managedConnections = new Set<Session>();
  const mcpPath = options.mcpPath ?? '/mcp';
  const logger = options.logger ?? NOOP_MCP_HTTP_LOGGER;
  const maxSessions = readPositiveIntegerOption(options.maxSessions, DEFAULT_MAX_SESSIONS, 'maxSessions');
  const sessionIdleTtlMs = readPositiveIntegerOption(
    options.sessionIdleTtlMs,
    DEFAULT_SESSION_IDLE_TTL_MS,
    'sessionIdleTtlMs',
    MAX_TIMER_DELAY_MS
  );
  const createMcpServer = options.createMcpServer ?? ((authContext, requestLogger) => createTvcMallMcpServer({ authContext, logger: requestLogger }));
  let pendingInitializations = 0;
  let shuttingDown = false;

  function detachConnection(session: Session): void {
    if (sessions.get(session.sessionId) === session) sessions.delete(session.sessionId);
    managedConnections.delete(session);
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = undefined;
    }
  }

  function markConnectionClosed(session: Session): void {
    const wasClosed = session.closed;
    session.closed = true;
    session.closing = false;
    detachConnection(session);
    if (!wasClosed) logger.sessionEvent('mcp_session_closed');
  }

  async function closeTransportSafely(transport: StreamableHTTPServerTransport): Promise<void> {
    try {
      await transport.close();
    } catch {
      // Cleanup must never escape into an unhandled rejection.
    }
  }

  async function closeConnection(session: Session): Promise<void> {
    if (session.closed || session.closing) return;
    session.closing = true;
    detachConnection(session);
    try {
      if (session.connected) {
        await session.mcpServer.close();
      } else {
        await session.transport.close();
      }
    } catch {
      if (session.connected) await closeTransportSafely(session.transport);
    } finally {
      const wasClosed = session.closed;
      session.closed = true;
      session.closing = false;
      detachConnection(session);
      if (!wasClosed) logger.sessionEvent('mcp_session_closed');
    }
  }

  function refreshIdleTimer(session: Session): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
    if (session.closed || session.closing || session.activeRequests > 0 || sessions.get(session.sessionId) !== session) return;

    session.idleTimer = setTimeout(() => {
      session.idleTimer = undefined;
      logger.sessionEvent('mcp_session_idle_expired');
      void closeConnection(session);
    }, sessionIdleTtlMs);
    session.idleTimer.unref();
  }

  const httpServer = createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestLog: {
      errorCode?: McpHttpErrorCode;
      jsonRpcMethod?: string;
      requestType: 'healthz' | 'mcp';
    } = { requestType: req.url === '/healthz' ? 'healthz' : 'mcp' };

    function sendLoggedHttpError(status: 400 | 401 | 404 | 429 | 503, code: McpHttpErrorCode): void {
      requestLog.errorCode = code;
      sendHttpError(res, status, code);
    }

    try {
      if (req.url === '/healthz' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== mcpPath) {
        sendLoggedHttpError(404, 'NOT_FOUND');
        return;
      }

      const pat = readTvcMallApiKey(req);
      if (!pat) {
        sendLoggedHttpError(401, 'AUTH_REQUIRED');
        return;
      }
      let authContext: RequestAuthContext;
      try {
        authContext = createPatAuthContext(pat);
      } catch {
        sendLoggedHttpError(401, 'AUTH_REQUIRED');
        return;
      }

      const sessionId = req.headers['mcp-session-id'];
      if (typeof sessionId === 'string') {
        const session = sessions.get(sessionId);
        if (!session) {
          sendLoggedHttpError(404, 'SESSION_NOT_FOUND');
          return;
        }
        if (session.patFingerprint !== authContext.patFingerprint) {
          sendLoggedHttpError(401, 'AUTH_REQUIRED');
          return;
        }

        session.activeRequests += 1;
        if (session.idleTimer) {
          clearTimeout(session.idleTimer);
          session.idleTimer = undefined;
        }
        try {
          const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
          requestLog.jsonRpcMethod = readJsonRpcMethod(body);
          await session.transport.handleRequest(req, res, body);
        } finally {
          session.activeRequests -= 1;
          refreshIdleTimer(session);
        }
        return;
      }

      if (req.method !== 'POST') {
        sendLoggedHttpError(400, 'SESSION_REQUIRED');
        return;
      }
      const body = await readJsonBody(req);
      requestLog.jsonRpcMethod = readJsonRpcMethod(body);
      if (!isInitializeRequest(body)) {
        sendLoggedHttpError(400, 'INITIALIZE_REQUIRED');
        return;
      }
      if (sessions.size + pendingInitializations >= maxSessions) {
        sendLoggedHttpError(503, 'SESSION_CAPACITY_REACHED');
        return;
      }

      pendingInitializations += 1;
      let connection: Session | undefined;
      let transport: StreamableHTTPServerTransport | undefined;
      try {
        const id = randomUUID();
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => id });
        const mcpServer = createMcpServer(authContext, logger);
        connection = {
          activeRequests: 0,
          closed: false,
          closing: false,
          connected: false,
          mcpServer,
          patFingerprint: authContext.patFingerprint,
          sessionId: id,
          transport
        };
        managedConnections.add(connection);
        transport.onclose = () => markConnectionClosed(connection!);

        await mcpServer.connect(transport);
        connection.connected = true;
        await transport.handleRequest(req, res, body);

        const initialized = transport.sessionId === id
          && res.headersSent
          && res.statusCode >= 200
          && res.statusCode < 300;
        if (!initialized || connection.closed || shuttingDown) {
          await closeConnection(connection);
          return;
        }

        sessions.set(id, connection);
        logger.sessionEvent('mcp_session_created');
        refreshIdleTimer(connection);
      } catch {
        if (connection) {
          await closeConnection(connection);
        } else if (transport) {
          await closeTransportSafely(transport);
        }
        if (!res.headersSent) sendLoggedHttpError(400, 'INVALID_REQUEST');
      } finally {
        pendingInitializations -= 1;
      }
    } catch {
      if (res.headersSent) return;
      sendLoggedHttpError(400, 'INVALID_REQUEST');
    } finally {
      logger.requestCompleted({
        ...requestLog,
        durationMs: Date.now() - startedAt,
        httpMethod: req.method ?? 'UNKNOWN',
        httpStatus: res.statusCode
      });
    }
  });

  function beginShutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const connection of [...managedConnections]) void closeConnection(connection);
  }

  const closeHttpServer = httpServer.close.bind(httpServer);
  httpServer.close = ((callback?: (error?: Error) => void) => {
    beginShutdown();
    return closeHttpServer(callback);
  }) as Server['close'];
  httpServer.on('close', beginShutdown);

  return httpServer;
}

export async function startMcpHttpServer(options: McpHttpServerOptions & { host: string; port: number }): Promise<Server> {
  const logger = options.logger ?? createMcpHttpLogger();
  const server = createMcpHttpServer({ ...options, logger });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  logger.serverStarted({ host: options.host, mcpPath: options.mcpPath ?? '/mcp', port });
  return server;
}

function readTvcMallApiKey(req: IncomingMessage): string | undefined {
  if (req.headers.authorization !== undefined) return undefined;
  const apiKey = req.headers['tvcmall_api_key'];
  if (typeof apiKey !== 'string') return undefined;
  if (apiKey !== apiKey.trim()) return undefined;
  return apiKey || undefined;
}

function isInitializeRequest(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize';
}

function readJsonRpcMethod(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const method = (body as { method?: unknown }).method;
  return typeof method === 'string' ? method : undefined;
}

function readPositiveIntegerOption(value: number | undefined, fallback: number, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}
