import { describe, expect, it } from 'vitest';
import { createMcpHttpLogger } from '../../src/logging/mcp-http-logger.js';

class StringOutput {
  value = '';

  write(chunk: string): boolean {
    this.value += chunk;
    return true;
  }
}

describe('MCP HTTP logger', () => {
  it('writes a safe info JSON line', () => {
    const output = new StringOutput();
    createMcpHttpLogger({ level: 'info', output }).requestCompleted({
      durationMs: 8,
      httpMethod: 'POST',
      httpStatus: 200,
      jsonRpcMethod: 'tools/call',
      requestType: 'mcp'
    });

    expect(JSON.parse(output.value)).toMatchObject({
      event: 'mcp_http_request_completed',
      level: 'info',
      durationMs: 8,
      httpMethod: 'POST',
      httpStatus: 200,
      jsonRpcMethod: 'tools/call',
      requestType: 'mcp'
    });
  });

  it('writes no records at the silent level', () => {
    const output = new StringOutput();
    const logger = createMcpHttpLogger({ level: 'silent', output });

    logger.serverStarted({ host: '127.0.0.1', mcpPath: '/mcp', port: 3000 });
    logger.toolCompleted({ toolName: 'tvcmall_search_products', outcome: 'success', durationMs: 4 });

    expect(output.value).toBe('');
  });

  it('writes only typed WebApi authorization diagnostics for a failed tool', () => {
    const output = new StringOutput();
    createMcpHttpLogger({ level: 'info', output }).toolCompleted({
      toolName: 'tvcmall_search_products',
      outcome: 'error',
      errorCode: 'PERMISSION_DENIED',
      webApiMethod: 'GET',
      normalizedRoute: 'api/v3/product/search',
      webApiStatus: 403,
      traceId: '00000000-0000-4000-8000-000000000000',
      authReason: 'scope_missing',
      durationMs: 8
    });

    const record = JSON.parse(output.value) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: 'mcp_tool_completed',
      level: 'warn',
      toolName: 'tvcmall_search_products',
      outcome: 'error',
      errorCode: 'PERMISSION_DENIED',
      webApiMethod: 'GET',
      normalizedRoute: 'api/v3/product/search',
      webApiStatus: 403,
      traceId: '00000000-0000-4000-8000-000000000000',
      authReason: 'scope_missing',
      durationMs: 8
    });
    expect(record).not.toHaveProperty('headers');
    expect(record).not.toHaveProperty('metadata');
    expect(record).not.toHaveProperty('webApiRequestBody');
    expect(record).not.toHaveProperty('webApiResponseBody');
  });

  it('writes a safe completion record for every failed WebApi request', () => {
    const output = new StringOutput();
    const logger = createMcpHttpLogger({ level: 'info', output });

    logger.webApiRequestCompleted({
      outcome: 'error',
      errorCode: 'PERMISSION_DENIED',
      webApiFailurePhase: 'http_response',
      authReasonState: 'missing',
      normalizedRoute: 'api/v3/user/points/stat',
      traceId: '00000000-0000-4000-8000-000000000000',
      webApiDurationMs: 42,
      webApiMethod: 'GET',
      webApiRequestHeaders: {},
      webApiRequestQuery: {},
      webApiResponseBodyState: 'unavailable',
      webApiStatus: 403
    });

    const record = JSON.parse(output.value) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: 'mcp_webapi_request_completed',
      level: 'warn',
      outcome: 'error',
      errorCode: 'PERMISSION_DENIED',
      webApiFailurePhase: 'http_response',
      authReasonState: 'missing',
      normalizedRoute: 'api/v3/user/points/stat',
      traceId: '00000000-0000-4000-8000-000000000000',
      webApiDurationMs: 42,
      webApiMethod: 'GET',
      webApiStatus: 403
    });
    expect(JSON.stringify(record)).not.toContain('Authorization');
    expect(record).not.toHaveProperty('headers');
  });

  it('writes detailed WebApi diagnostics without adding them to tool summaries', () => {
    const output = new StringOutput();
    const logger = createMcpHttpLogger({ level: 'info', output });

    logger.webApiRequestCompleted({
      errorCode: 'PERMISSION_DENIED',
      normalizedRoute: 'api/v3/user/points/stat',
      outcome: 'error',
      traceId: '00000000-0000-4000-8000-000000000000',
      webApiDurationMs: 42,
      webApiFailurePhase: 'http_response',
      webApiMethod: 'GET',
      webApiRequestBody: '{"query":"case"}',
      webApiRequestBodyBytes: 16,
      webApiRequestBodyTruncated: false,
      webApiRequestHeaders: {
        authorization: '[REDACTED]',
        'content-type': 'application/json'
      },
      webApiRequestQuery: { page: '2' },
      webApiResponseBody: '{"code":"ROUTE_NOT_ALLOWED"}',
      webApiResponseBodyBytes: 28,
      webApiResponseBodyState: 'complete',
      webApiResponseBodyTruncated: false,
      webApiResponseHeaders: { 'content-type': 'application/json' },
      webApiStatus: 403
    });

    expect(JSON.parse(output.value)).toMatchObject({
      event: 'mcp_webapi_request_completed',
      webApiRequestBody: '{"query":"case"}',
      webApiRequestBodyBytes: 16,
      webApiRequestBodyTruncated: false,
      webApiRequestHeaders: {
        authorization: '[REDACTED]',
        'content-type': 'application/json'
      },
      webApiRequestQuery: { page: '2' },
      webApiResponseBody: '{"code":"ROUTE_NOT_ALLOWED"}',
      webApiResponseBodyBytes: 28,
      webApiResponseBodyState: 'complete',
      webApiResponseBodyTruncated: false,
      webApiResponseHeaders: { 'content-type': 'application/json' }
    });
  });
});
