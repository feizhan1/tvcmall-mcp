export const API_ENV_VALUES = ['production', 'staging', 'sandbox'] as const;
export const LOG_LEVEL_VALUES = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export const DATA_SOURCE_VALUES = ['fake', 'real'] as const;

export type TvcMallApiEnv = typeof API_ENV_VALUES[number];
export type TvcMallLogLevel = typeof LOG_LEVEL_VALUES[number];
export type TvcMallDataSource = typeof DATA_SOURCE_VALUES[number];

export interface TvcMallRuntimeConfig {
  apiBaseUrl: string;
  apiTimeoutMs: number;
  apiEnv: TvcMallApiEnv;
  logLevel: TvcMallLogLevel;
  dataSource: TvcMallDataSource;
  mcpHost: string;
  mcpPort: number;
  mcpPath: string;
  apiKeyVerifyUrl: string;
  apiKeyVerifyTimeoutMs: number;
  exportDir?: string;
  exportTtlMs: number;
  apiAuthorization?: string;
}

export const DEFAULT_RUNTIME_CONFIG = {
  apiBaseUrl: 'http://192.168.1.16:8084/api/m',
  apiTimeoutMs: 15000,
  apiEnv: 'production',
  logLevel: 'info',
  dataSource: 'real',
  mcpHost: '127.0.0.1',
  mcpPort: 3000,
  mcpPath: '/mcp',
  apiKeyVerifyTimeoutMs: 5000,
  exportTtlMs: 3600000
} satisfies Omit<TvcMallRuntimeConfig, 'apiKeyVerifyUrl'>;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): TvcMallRuntimeConfig {
  const apiEnv = readEnum(env.TVCMALL_API_ENV, API_ENV_VALUES) ?? DEFAULT_RUNTIME_CONFIG.apiEnv;
  return {
    apiBaseUrl: readString(env.TVCMALL_API_BASE_URL) ?? DEFAULT_RUNTIME_CONFIG.apiBaseUrl,
    apiTimeoutMs: readPositiveInteger(env.TVCMALL_API_TIMEOUT_MS) ?? DEFAULT_RUNTIME_CONFIG.apiTimeoutMs,
    apiEnv,
    logLevel: readEnum(env.TVCMALL_LOG_LEVEL, LOG_LEVEL_VALUES) ?? DEFAULT_RUNTIME_CONFIG.logLevel,
    dataSource: readEnum(env.TVCMALL_DATA_SOURCE, DATA_SOURCE_VALUES) ?? DEFAULT_RUNTIME_CONFIG.dataSource,
    mcpHost: readString(env.TVCMALL_MCP_HOST) ?? DEFAULT_RUNTIME_CONFIG.mcpHost,
    mcpPort: readPositiveInteger(env.TVCMALL_MCP_PORT) ?? DEFAULT_RUNTIME_CONFIG.mcpPort,
    mcpPath: readMcpPath(env.TVCMALL_MCP_PATH) ?? DEFAULT_RUNTIME_CONFIG.mcpPath,
    apiKeyVerifyUrl: readApiKeyVerifyUrl(env.TVCMALL_API_KEY_VERIFY_URL, apiEnv, env.TVCMALL_ALLOW_INSECURE_API_KEY_VERIFY_URL_FOR_DEVELOPMENT),
    apiKeyVerifyTimeoutMs: readPositiveInteger(env.TVCMALL_API_KEY_VERIFY_TIMEOUT_MS) ?? DEFAULT_RUNTIME_CONFIG.apiKeyVerifyTimeoutMs,
    ...readOptionalValue('exportDir', env.TVCMALL_EXPORT_DIR),
    exportTtlMs: readPositiveInteger(env.TVCMALL_EXPORT_TTL_MS) ?? DEFAULT_RUNTIME_CONFIG.exportTtlMs,
    ...readOptionalValue('apiAuthorization', env.TVCMALL_API_AUTHORIZATION)
  };
}

function readString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  const trimmed = readString(value);
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function readMcpPath(value: string | undefined): string | undefined {
  const path = readString(value);
  if (!path?.startsWith('/') || path.includes('?') || path.includes('#')) return undefined;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function readApiKeyVerifyUrl(value: string | undefined, apiEnv: TvcMallApiEnv, allowInsecureForDevelopment: string | undefined): string {
  const url = readString(value);
  if (!url) throw new Error('TVCMALL_API_KEY_VERIFY_URL must be explicitly configured as an HTTPS URL');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TVCMALL_API_KEY_VERIFY_URL must be a valid HTTPS URL');
  }

  if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return url;

  const isExplicitDevelopmentHttp = parsed.protocol === 'http:'
    && apiEnv !== 'production'
    && allowInsecureForDevelopment?.trim().toLowerCase() === 'true';
  if (isExplicitDevelopmentHttp) return url;

  throw new Error('TVCMALL_API_KEY_VERIFY_URL must be an HTTPS URL outside explicitly enabled development use');
}

function readEnum<T extends readonly string[]>(value: string | undefined, allowedValues: T): T[number] | undefined {
  const trimmed = readString(value);
  if (!trimmed) return undefined;
  return allowedValues.includes(trimmed) ? trimmed : undefined;
}

function readOptionalValue<K extends 'exportDir' | 'apiAuthorization'>(key: K, value: string | undefined): Pick<TvcMallRuntimeConfig, K> | Record<string, never> {
  const parsed = readString(value);
  return parsed ? { [key]: parsed } as Pick<TvcMallRuntimeConfig, K> : {};
}
