import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from '../../src/config/runtime-config.js';

describe('runtime config', () => {
  it.each([
    ['is missing', {}],
    ['is blank', { TVCMALL_WEBAPI_BASE_URL: '   ' }],
    ['uses HTTP', { TVCMALL_WEBAPI_BASE_URL: 'http://webapi.tvcmall.test' }],
    ['is not a valid URL', { TVCMALL_WEBAPI_BASE_URL: 'not a URL' }]
  ])('rejects a production WebApi base URL that %s', (_description, env) => {
    expect(() => loadRuntimeConfig(env)).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
  });

  it.each([
    'https://webapi.tvcmall.test/api/m?secret=query-value',
    'https://webapi.tvcmall.test/api/m#secret-fragment'
  ])('rejects a WebApi base URL with query or fragment without exposing it: %s', (webApiBaseUrl) => {
    let error: unknown;
    try {
      loadRuntimeConfig({ TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ message: 'TVCMALL_WEBAPI_BASE_URL must not include query parameters or fragments' });
    expect(String(error)).not.toContain(webApiBaseUrl);
  });

  it('rejects WebApi URL userinfo without exposing credentials or the original URL', () => {
    const webApiBaseUrl = 'https://user:password@webapi.tvcmall.test';
    let error: unknown;
    try {
      loadRuntimeConfig({ TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ message: 'TVCMALL_WEBAPI_BASE_URL must be an HTTPS URL' });
    expect(String(error)).not.toContain('user');
    expect(String(error)).not.toContain('password');
    expect(String(error)).not.toContain(webApiBaseUrl);
  });

  it('loads WebApi settings and ignores removed verification service variables', () => {
    expect(loadRuntimeConfig({
      TVCMALL_WEBAPI_BASE_URL: ' https://sandbox-webapi.tvcmall.test/api/m ',
      TVCMALL_API_BASE_URL: 'https://legacy-api.tvcmall.test',
      TVCMALL_API_TIMEOUT_MS: '25000',
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_LOG_LEVEL: 'debug',
      TVCMALL_MCP_HOST: ' 127.0.0.1 ',
      TVCMALL_MCP_PORT: '3100',
      TVCMALL_MCP_PATH: ' /customer-mcp ',
      TVCMALL_EXPORT_DIR: ' /tmp/tvcmall-exports ',
      TVCMALL_EXPORT_TTL_MS: '7200000',
      TVCMALL_API_KEY_VERIFY_URL: 'not a URL',
      TVCMALL_API_KEY_VERIFY_TIMEOUT_MS: '1',
      TVCMALL_ALLOW_INSECURE_API_KEY_VERIFY_URL_FOR_DEVELOPMENT: 'true',
      TVCMALL_API_AUTHORIZATION: ' login-api-authorization-example ',
      TVCMALL_DATA_SOURCE: 'real'
    })).toEqual({
      webApiBaseUrl: 'https://sandbox-webapi.tvcmall.test/api/m',
      apiTimeoutMs: 25000,
      apiEnv: 'sandbox',
      logLevel: 'debug',
      mcpHost: '127.0.0.1',
      mcpPort: 3100,
      mcpPath: '/customer-mcp',
      exportDir: '/tmp/tvcmall-exports',
      exportTtlMs: 7200000,
      apiAuthorization: 'login-api-authorization-example',
      dataSource: 'real'
    });
  });

  it('falls back to defaults for invalid numeric and enum values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_WEBAPI_BASE_URL: 'https://webapi.tvcmall.test',
      TVCMALL_API_TIMEOUT_MS: '-1',
      TVCMALL_API_ENV: 'qa',
      TVCMALL_LOG_LEVEL: 'verbose'
    })).toEqual({
      ...DEFAULT_RUNTIME_CONFIG,
      webApiBaseUrl: 'https://webapi.tvcmall.test'
    });
  });

  it('ignores blank optional values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_EXPORT_DIR: '   ',
      TVCMALL_WEBAPI_BASE_URL: 'https://webapi.tvcmall.test',
      TVCMALL_API_AUTHORIZATION: '   '
    })).toEqual({
      ...DEFAULT_RUNTIME_CONFIG,
      webApiBaseUrl: 'https://webapi.tvcmall.test'
    });
  });
});
