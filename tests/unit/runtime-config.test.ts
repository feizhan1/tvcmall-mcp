import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from '../../src/config/runtime-config.js';

describe('runtime config', () => {
  it.each([
    ['is missing', {}],
    ['is blank', { TVCMALL_API_KEY_VERIFY_URL: '   ' }],
    ['uses HTTP', { TVCMALL_API_KEY_VERIFY_URL: 'http://auth.tvcmall.test/verify' }],
    ['is not a valid URL', { TVCMALL_API_KEY_VERIFY_URL: 'not a URL' }]
  ])('rejects a production API Key verification URL that %s', (_description, env) => {
    expect(() => loadRuntimeConfig(env)).toThrow(/TVCMALL_API_KEY_VERIFY_URL/);
  });

  it('allows an HTTP verification URL only with the explicit non-production development switch', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_API_KEY_VERIFY_URL: 'http://auth.tvcmall.test/verify',
      TVCMALL_ALLOW_INSECURE_API_KEY_VERIFY_URL_FOR_DEVELOPMENT: 'true'
    }).apiKeyVerifyUrl).toBe('http://auth.tvcmall.test/verify');
  });

  it.each([
    ['the development switch is absent', {
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_API_KEY_VERIFY_URL: 'http://auth.tvcmall.test/verify'
    }],
    ['the environment is production', {
      TVCMALL_API_KEY_VERIFY_URL: 'http://auth.tvcmall.test/verify',
      TVCMALL_ALLOW_INSECURE_API_KEY_VERIFY_URL_FOR_DEVELOPMENT: 'true'
    }]
  ])('rejects an HTTP verification URL when %s', (_description, env) => {
    expect(() => loadRuntimeConfig(env)).toThrow(/TVCMALL_API_KEY_VERIFY_URL/);
  });

  it('loads HTTP API settings from environment variables', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_BASE_URL: ' https://sandbox-api.tvcmall.test ',
      TVCMALL_API_TIMEOUT_MS: '25000',
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_LOG_LEVEL: 'debug',
      TVCMALL_MCP_HOST: ' 127.0.0.1 ',
      TVCMALL_MCP_PORT: '3100',
      TVCMALL_MCP_PATH: ' /customer-mcp ',
      TVCMALL_API_KEY_VERIFY_URL: ' https://auth.tvcmall.test/api/mcp/auth/verify ',
      TVCMALL_API_KEY_VERIFY_TIMEOUT_MS: '4000',
      TVCMALL_EXPORT_DIR: ' /tmp/tvcmall-exports ',
      TVCMALL_EXPORT_TTL_MS: '7200000',
      TVCMALL_API_AUTHORIZATION: ' login-api-authorization-example ',
      TVCMALL_DATA_SOURCE: 'real'
    })).toEqual({
      apiBaseUrl: 'https://sandbox-api.tvcmall.test',
      apiTimeoutMs: 25000,
      apiEnv: 'sandbox',
      logLevel: 'debug',
      mcpHost: '127.0.0.1',
      mcpPort: 3100,
      mcpPath: '/customer-mcp',
      apiKeyVerifyUrl: 'https://auth.tvcmall.test/api/mcp/auth/verify',
      apiKeyVerifyTimeoutMs: 4000,
      exportDir: '/tmp/tvcmall-exports',
      exportTtlMs: 7200000,
      apiAuthorization: 'login-api-authorization-example',
      dataSource: 'real'
    });
  });

  it('falls back to defaults for invalid numeric and enum values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_TIMEOUT_MS: '-1',
      TVCMALL_API_ENV: 'qa',
      TVCMALL_LOG_LEVEL: 'verbose',
      TVCMALL_API_KEY_VERIFY_URL: 'https://auth.tvcmall.test/verify'
    })).toEqual({
      ...DEFAULT_RUNTIME_CONFIG,
      apiKeyVerifyUrl: 'https://auth.tvcmall.test/verify'
    });
  });

  it('ignores blank optional values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_BASE_URL: '   ',
      TVCMALL_EXPORT_DIR: '   ',
      TVCMALL_API_KEY_VERIFY_URL: 'https://auth.tvcmall.test/verify'
    })).toEqual({
      ...DEFAULT_RUNTIME_CONFIG,
      apiKeyVerifyUrl: 'https://auth.tvcmall.test/verify'
    });
  });
});
