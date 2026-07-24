export const API_ENV_VALUES = ['production', 'staging', 'sandbox'] as const;
export const LOG_LEVEL_VALUES = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export const DATA_SOURCE_VALUES = ['fake', 'real'] as const;

export type TvcMallApiEnv = typeof API_ENV_VALUES[number];
export type TvcMallLogLevel = typeof LOG_LEVEL_VALUES[number];
export type TvcMallDataSource = typeof DATA_SOURCE_VALUES[number];

const MAX_API_TIMEOUT_MS = 2_147_483_647;

export interface TvcMallRuntimeConfig {
  webApiBaseUrl: string;
  allowInsecureWebApiHttp: boolean;
  apiTimeoutMs: number;
  apiEnv: TvcMallApiEnv;
  logLevel: TvcMallLogLevel;
  dataSource: TvcMallDataSource;
  mcpHost: string;
  mcpPort: number;
  mcpPath: string;
  apiAuthorization?: string;
}

export const DEFAULT_RUNTIME_CONFIG = {
  allowInsecureWebApiHttp: false,
  apiTimeoutMs: 15000,
  apiEnv: 'production',
  logLevel: 'info',
  dataSource: 'real',
  mcpHost: '127.0.0.1',
  mcpPort: 3000,
  mcpPath: '/mcp',
} satisfies Omit<TvcMallRuntimeConfig, 'webApiBaseUrl'>;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): TvcMallRuntimeConfig {
  const apiEnv = readEnum(env.TVCMALL_API_ENV, API_ENV_VALUES) ?? DEFAULT_RUNTIME_CONFIG.apiEnv;
  const allowInsecureWebApiHttp = readAllowInsecureWebApiHttp(env.TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP);
  return {
    webApiBaseUrl: readWebApiBaseUrl(env.TVCMALL_WEBAPI_BASE_URL, apiEnv, allowInsecureWebApiHttp),
    allowInsecureWebApiHttp,
    apiTimeoutMs: readApiTimeoutMs(env.TVCMALL_API_TIMEOUT_MS) ?? DEFAULT_RUNTIME_CONFIG.apiTimeoutMs,
    apiEnv,
    logLevel: readEnum(env.TVCMALL_LOG_LEVEL, LOG_LEVEL_VALUES) ?? DEFAULT_RUNTIME_CONFIG.logLevel,
    dataSource: readEnum(env.TVCMALL_DATA_SOURCE, DATA_SOURCE_VALUES) ?? DEFAULT_RUNTIME_CONFIG.dataSource,
    mcpHost: readString(env.TVCMALL_MCP_HOST) ?? DEFAULT_RUNTIME_CONFIG.mcpHost,
    mcpPort: readPositiveInteger(env.TVCMALL_MCP_PORT) ?? DEFAULT_RUNTIME_CONFIG.mcpPort,
    mcpPath: readMcpPath(env.TVCMALL_MCP_PATH) ?? DEFAULT_RUNTIME_CONFIG.mcpPath,
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

function readApiTimeoutMs(value: string | undefined): number | undefined {
  const parsed = readPositiveInteger(value);
  return parsed !== undefined && parsed <= MAX_API_TIMEOUT_MS ? parsed : undefined;
}

function readMcpPath(value: string | undefined): string | undefined {
  const path = readString(value);
  if (!path?.startsWith('/') || path.includes('?') || path.includes('#')) return undefined;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function readAllowInsecureWebApiHttp(value: string | undefined): boolean {
  return value?.trim() === 'true';
}

function readWebApiBaseUrl(value: string | undefined, apiEnv: TvcMallApiEnv, allowInsecureWebApiHttp: boolean): string {
  const url = readString(value);
  if (!url) throw new Error('TVCMALL_WEBAPI_BASE_URL must be explicitly configured');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must be a valid URL');
  }

  if (/[?#]/.test(url)) {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must not include query parameters or fragments');
  }
  if (parsed.username || parsed.password) {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must not include userinfo');
  }
  if (parsed.protocol === 'https:') return url;
  if (parsed.protocol !== 'http:') throw new Error('TVCMALL_WEBAPI_BASE_URL must use HTTPS or HTTP');
  if (allowInsecureWebApiHttp || (apiEnv === 'sandbox' && isSandboxHttpHost(parsed.hostname))) return url;
  throw new Error('TVCMALL_WEBAPI_BASE_URL requires TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true for HTTP');
}

function isSandboxHttpHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;

  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 127
    || first === 10
    || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function readEnum<T extends readonly string[]>(value: string | undefined, allowedValues: T): T[number] | undefined {
  const trimmed = readString(value);
  if (!trimmed) return undefined;
  return allowedValues.includes(trimmed) ? trimmed : undefined;
}

function readOptionalValue<K extends 'apiAuthorization'>(key: K, value: string | undefined): Pick<TvcMallRuntimeConfig, K> | Record<string, never> {
  const parsed = readString(value);
  return parsed ? { [key]: parsed } as Pick<TvcMallRuntimeConfig, K> : {};
}
