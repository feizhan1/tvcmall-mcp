import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from '../../src/config/runtime-config.js';

describe('runtime config', () => {
  it('uses safe defaults when env is empty', () => {
    expect(loadRuntimeConfig({})).toEqual(DEFAULT_RUNTIME_CONFIG);
  });

  it('loads HTTP API settings from environment variables', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_BASE_URL: ' https://sandbox-api.tvcmall.test ',
      TVCMALL_API_TIMEOUT_MS: '25000',
      TVCMALL_API_ENV: 'sandbox',
      TVCMALL_LOG_LEVEL: 'debug',
      TVCMALL_EXPORT_DIR: ' /tmp/tvcmall-exports '
    })).toEqual({
      apiBaseUrl: 'https://sandbox-api.tvcmall.test',
      apiTimeoutMs: 25000,
      apiEnv: 'sandbox',
      logLevel: 'debug',
      exportDir: '/tmp/tvcmall-exports'
    });
  });

  it('falls back to defaults for invalid numeric and enum values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_TIMEOUT_MS: '-1',
      TVCMALL_API_ENV: 'qa',
      TVCMALL_LOG_LEVEL: 'verbose'
    })).toEqual(DEFAULT_RUNTIME_CONFIG);
  });

  it('ignores blank optional values', () => {
    expect(loadRuntimeConfig({
      TVCMALL_API_BASE_URL: '   ',
      TVCMALL_EXPORT_DIR: '   '
    })).toEqual(DEFAULT_RUNTIME_CONFIG);
  });
});
