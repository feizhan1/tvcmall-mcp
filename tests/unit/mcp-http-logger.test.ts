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
  });
});
