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
    'http://localhost:8084/api/m',
    'http://127.0.0.2:8084/api/m',
    'http://10.20.30.40:8084/api/m',
    'http://172.16.0.1:8084/api/m',
    'http://172.31.255.254:8084/api/m',
    'http://192.168.1.16:8084/api/m',
    'http://[::1]:8084/api/m'
  ])('allows sandbox private HTTP WebApi URL %s', (webApiBaseUrl) => {
    expect(loadRuntimeConfig({
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl
    }).webApiBaseUrl).toBe(webApiBaseUrl);
  });

  it.each(['production', 'staging'])('rejects private HTTP in %s', (apiEnv) => {
    expect(() => loadRuntimeConfig({
      TVCMALL_API_ENV: apiEnv,
      TVCMALL_WEBAPI_BASE_URL: 'http://192.168.1.16:8084/api/m'
    })).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
  });

  it.each([
    undefined,
    '   ',
    'false',
    'TRUE',
    '1',
    'yes'
  ])('does not allow staging public HTTP for insecure WebApi HTTP value %s', (allowInsecureWebApiHttp) => {
    expect(() => loadRuntimeConfig({
      TVCMALL_API_ENV: 'staging',
      TVCMALL_WEBAPI_BASE_URL: 'http://113.108.60.83:8084/api',
      ...(allowInsecureWebApiHttp === undefined
        ? {}
        : { TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: allowInsecureWebApiHttp })
    })).toThrow('TVCMALL_WEBAPI_BASE_URL requires TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true for HTTP');
  });

  it.each(['production', 'staging', 'sandbox'])('allows public HTTP in %s only with the explicit insecure WebApi HTTP switch', (apiEnv) => {
    expect(loadRuntimeConfig({
      TVCMALL_API_ENV: apiEnv,
      TVCMALL_WEBAPI_BASE_URL: 'http://113.108.60.83:8084/api',
      TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: 'true'
    })).toMatchObject({
      webApiBaseUrl: 'http://113.108.60.83:8084/api',
      apiEnv,
      allowInsecureWebApiHttp: true
    });
  });

  it('rejects non-HTTP(S) WebApi URLs even with the insecure HTTP switch without exposing the URL', () => {
    const webApiBaseUrl = 'ftp://113.108.60.83:8084/api';
    let error: unknown;
    try {
      loadRuntimeConfig({
        TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl,
        TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: 'true'
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ message: 'TVCMALL_WEBAPI_BASE_URL must use HTTPS or HTTP' });
    expect(String(error)).not.toContain(webApiBaseUrl);
  });

  it.each([
    ['userinfo', 'http://mcp-user:top-secret@113.108.60.83:8084/api', 'mcp-user', 'top-secret'],
    ['query parameters', 'http://113.108.60.83:8084/api?secret=query-value', 'query-value', undefined],
    ['fragments', 'http://113.108.60.83:8084/api#secret-fragment', 'secret-fragment', undefined]
  ])('keeps rejecting HTTP WebApi URL %s with the insecure switch without exposing sensitive values', (_description, webApiBaseUrl, sensitiveValue, additionalSensitiveValue) => {
    let error: unknown;
    try {
      loadRuntimeConfig({
        TVCMALL_API_ENV: 'staging',
        TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl,
        TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: 'true'
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(webApiBaseUrl);
    expect(String(error)).not.toContain(sensitiveValue);
    if (additionalSensitiveValue) expect(String(error)).not.toContain(additionalSensitiveValue);
  });

  it.each([
    undefined,
    'invalid'
  ])('rejects private HTTP when the environment falls back to production: %s', (apiEnv) => {
    expect(() => loadRuntimeConfig({
      ...(apiEnv === undefined ? {} : { TVCMALL_API_ENV: apiEnv }),
      TVCMALL_WEBAPI_BASE_URL: 'http://192.168.1.16:8084/api/m'
    })).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
  });

  it.each([
    'http://example.com/api/m',
    'http://localhost.example.com/api/m',
    'http://8.8.8.8/api/m',
    'http://169.254.169.254/api/m',
    'http://100.64.0.1/api/m',
    'http://172.15.255.255/api/m',
    'http://172.32.0.1/api/m'
  ])('rejects sandbox HTTP outside the explicit private allowlist: %s', (webApiBaseUrl) => {
    expect(() => loadRuntimeConfig({
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl
    })).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
  });

  it.each([
    'https://webapi.tvcmall.test/api/m?secret=query-value',
    'https://webapi.tvcmall.test/api/m#secret-fragment',
    'https://webapi.test/api/m?',
    'https://webapi.test/api/m#'
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
    const webApiBaseUrl = 'https://mcp-user:top-secret@webapi.tvcmall.test';
    let error: unknown;
    try {
      loadRuntimeConfig({ TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ message: 'TVCMALL_WEBAPI_BASE_URL must not include userinfo' });
    expect(String(error)).not.toContain('mcp-user');
    expect(String(error)).not.toContain('top-secret');
    expect(String(error)).not.toContain(webApiBaseUrl);
  });

  it.each([
    'http://192.168.1.16:8084/api/m?secret=value',
    'http://192.168.1.16:8084/api/m#secret',
    'http://user:password@192.168.1.16:8084/api/m'
  ])('rejects unsafe sandbox HTTP without exposing it: %s', (webApiBaseUrl) => {
    let error: unknown;
    try {
      loadRuntimeConfig({
        TVCMALL_API_ENV: 'sandbox',
        TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(webApiBaseUrl);
    expect(String(error)).not.toContain('password');
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
      apiAuthorization: 'login-api-authorization-example',
      dataSource: 'real',
      allowInsecureWebApiHttp: false
    });
  });

  it('defaults insecure WebApi HTTP to false', () => {
    expect(DEFAULT_RUNTIME_CONFIG.allowInsecureWebApiHttp).toBe(false);
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

  it('accepts the Node timer maximum and falls back for a larger API timeout', () => {
    expect(loadRuntimeConfig({
      TVCMALL_WEBAPI_BASE_URL: 'https://webapi.tvcmall.test',
      TVCMALL_API_TIMEOUT_MS: '2147483647'
    }).apiTimeoutMs).toBe(2_147_483_647);

    expect(loadRuntimeConfig({
      TVCMALL_WEBAPI_BASE_URL: 'https://webapi.tvcmall.test',
      TVCMALL_API_TIMEOUT_MS: '2147483648'
    }).apiTimeoutMs).toBe(DEFAULT_RUNTIME_CONFIG.apiTimeoutMs);
  });

  it('ignores blank optional values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_WEBAPI_BASE_URL: 'https://webapi.tvcmall.test',
      TVCMALL_API_AUTHORIZATION: '   '
    })).toEqual({
      ...DEFAULT_RUNTIME_CONFIG,
      webApiBaseUrl: 'https://webapi.tvcmall.test'
    });
  });
});
