import { describe, expect, it } from 'vitest';
import {
  WEBAPI_LOG_BODY_MAX_BYTES,
  createBodySnapshot,
  createRequestBodySnapshot,
  sanitizeHeaders,
  sanitizeQuery
} from '../../src/security/webapi-log-sanitizer.js';

describe('WebApi log sanitizer', () => {
  it('keeps diagnostic fields while redacting credentials and PII recursively', () => {
    const snapshot = createBodySnapshot(JSON.stringify({
      errorCode: 'ROUTE_DENIED',
      detail: 'route is not registered',
      password: 'plain-password',
      nested: {
        address: '1 Infinite Loop',
        email: 'buyer@example.com',
        phone: '+1 415 555 0198'
      }
    }));

    expect(snapshot).toMatchObject({
      body: expect.stringContaining('ROUTE_DENIED'),
      bodyBytes: expect.any(Number),
      bodyTruncated: false
    });
    expect(snapshot.body).toContain('route is not registered');
    expect(snapshot.body).not.toContain('plain-password');
    expect(snapshot.body).not.toContain('buyer@example.com');
    expect(snapshot.body).not.toContain('415 555 0198');
    expect(snapshot.body).not.toContain('1 Infinite Loop');
  });

  it('redacts sensitive headers but retains trace and content metadata', () => {
    expect(sanitizeHeaders(new Headers({
      Authorization: 'Bearer tmcp_v1_id.secret',
      Cookie: 'sid=secret',
      'Content-Type': 'application/json',
      'X-TVCMall-MCP-Trace-Id': '00000000-0000-4000-8000-000000000000'
    }))).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'content-type': 'application/json',
      'x-tvcmall-mcp-trace-id': '00000000-0000-4000-8000-000000000000'
    });
  });

  it('redacts query values by key and preserves repeated parameters', () => {
    expect(sanitizeQuery(new URL('https://webapi.test/path?page=2&email=a%40b.com&tag=a&tag=b'))).toEqual({
      email: '[REDACTED]',
      page: '2',
      tag: ['a', 'b']
    });
  });

  it('truncates after redaction without splitting UTF-8 characters', () => {
    const snapshot = createBodySnapshot(JSON.stringify({
      detail: '中'.repeat(20_000),
      token: 'never-log-me'
    }));

    expect(snapshot.bodyTruncated).toBe(true);
    expect(Buffer.byteLength(snapshot.body, 'utf8')).toBeLessThanOrEqual(WEBAPI_LOG_BODY_MAX_BYTES);
    expect(snapshot.body).not.toContain('never-log-me');
    expect(snapshot.body).not.toContain('\uFFFD');
  });

  it('keeps stream-like request bodies opaque', () => {
    expect(createRequestBodySnapshot(new FormData())).toEqual({ bodyType: 'FormData' });
  });
});
