import type { TvcMallLogLevel } from '../config/runtime-config.js';
import type { McpErrorCode } from '../errors/mcp-errors.js';
import type { WebApiFailureMetadata } from '../api/http-client.js';

export interface LogOutput {
  write(chunk: string): unknown;
}

export type McpHttpErrorCode =
  | 'AUTH_REQUIRED'
  | 'INITIALIZE_REQUIRED'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'SESSION_CAPACITY_REACHED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REQUIRED';

export type TvcMallToolName =
  | 'tvcmall_auth_status'
  | 'tvcmall_search_products'
  | 'tvcmall_get_product_detail'
  | 'tvcmall_get_points'
  | 'tvcmall_list_point_records'
  | 'tvcmall_list_balance_records'
  | 'tvcmall_estimate_shipping'
  | 'tvcmall_list_orders'
  | 'tvcmall_get_order_detail'
  | 'tvcmall_get_tracking_info'
  | 'tvcmall_batch_get_tracking';

type ToolWebApiDiagnostics = Pick<
  WebApiFailureMetadata,
  'authReason' | 'normalizedRoute' | 'traceId' | 'webApiMethod' | 'webApiStatus'
>;

export interface McpHttpLogger {
  serverStarted(details: { host: string; mcpPath: string; port: number }): void;
  requestCompleted(details: {
    durationMs: number;
    errorCode?: McpHttpErrorCode;
    httpMethod: string;
    httpStatus: number;
    jsonRpcMethod?: string;
    requestType: 'healthz' | 'mcp';
  }): void;
  sessionEvent(event: 'mcp_session_created' | 'mcp_session_closed' | 'mcp_session_idle_expired'): void;
  toolCompleted(details: {
    authReason?: ToolWebApiDiagnostics['authReason'];
    durationMs: number;
    errorCode?: McpErrorCode;
    normalizedRoute?: ToolWebApiDiagnostics['normalizedRoute'];
    outcome: 'error' | 'success';
    traceId?: ToolWebApiDiagnostics['traceId'];
    toolName: TvcMallToolName;
    webApiMethod?: ToolWebApiDiagnostics['webApiMethod'];
    webApiStatus?: ToolWebApiDiagnostics['webApiStatus'];
  }): void;
}

export const NOOP_MCP_HTTP_LOGGER: McpHttpLogger = {
  serverStarted() {},
  requestCompleted() {},
  sessionEvent() {},
  toolCompleted() {}
};

const LEVEL_PRIORITY: Record<TvcMallLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY
};

export function createMcpHttpLogger(options: {
  level?: TvcMallLogLevel;
  output?: LogOutput;
} = {}): McpHttpLogger {
  const configuredLevel = options.level ?? 'info';
  const output = options.output ?? process.stderr;

  function write(level: Exclude<TvcMallLogLevel, 'silent'>, event: string, details: Record<string, string | number | undefined>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel]) return;
    output.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details })}\n`);
  }

  return {
    serverStarted({ host, mcpPath, port }) {
      write('info', 'mcp_http_server_started', { host, mcpPath, port });
    },
    requestCompleted({ durationMs, errorCode, httpMethod, httpStatus, jsonRpcMethod, requestType }) {
      const level = httpStatus >= 500 ? 'error' : httpStatus >= 400 ? 'warn' : 'info';
      write(level, 'mcp_http_request_completed', { durationMs, errorCode, httpMethod, httpStatus, jsonRpcMethod, requestType });
    },
    sessionEvent(event) {
      write('debug', event, {});
    },
    toolCompleted({ authReason, durationMs, errorCode, normalizedRoute, outcome, traceId, toolName, webApiMethod, webApiStatus }) {
      write(outcome === 'error' ? 'warn' : 'info', 'mcp_tool_completed', {
        authReason,
        durationMs,
        errorCode,
        normalizedRoute,
        outcome,
        traceId,
        toolName,
        webApiMethod,
        webApiStatus
      });
    }
  };
}
