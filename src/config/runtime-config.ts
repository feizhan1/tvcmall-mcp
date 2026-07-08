export const API_ENV_VALUES = ['production', 'staging', 'sandbox'] as const;
export const LOG_LEVEL_VALUES = ['silent', 'error', 'warn', 'info', 'debug'] as const;

export type TvcMallApiEnv = typeof API_ENV_VALUES[number];
export type TvcMallLogLevel = typeof LOG_LEVEL_VALUES[number];

export interface TvcMallRuntimeConfig {
  apiBaseUrl: string;
  apiTimeoutMs: number;
  apiEnv: TvcMallApiEnv;
  logLevel: TvcMallLogLevel;
  exportDir?: string;
}

export const DEFAULT_RUNTIME_CONFIG: TvcMallRuntimeConfig = {
  apiBaseUrl: 'https://api.tvcmall.com',
  apiTimeoutMs: 15000,
  apiEnv: 'production',
  logLevel: 'info'
};

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): TvcMallRuntimeConfig {
  return {
    apiBaseUrl: readString(env.TVCMALL_API_BASE_URL) ?? DEFAULT_RUNTIME_CONFIG.apiBaseUrl,
    apiTimeoutMs: readPositiveInteger(env.TVCMALL_API_TIMEOUT_MS) ?? DEFAULT_RUNTIME_CONFIG.apiTimeoutMs,
    apiEnv: readEnum(env.TVCMALL_API_ENV, API_ENV_VALUES) ?? DEFAULT_RUNTIME_CONFIG.apiEnv,
    logLevel: readEnum(env.TVCMALL_LOG_LEVEL, LOG_LEVEL_VALUES) ?? DEFAULT_RUNTIME_CONFIG.logLevel,
    ...readOptionalExportDir(env.TVCMALL_EXPORT_DIR)
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

function readEnum<T extends readonly string[]>(value: string | undefined, allowedValues: T): T[number] | undefined {
  const trimmed = readString(value);
  if (!trimmed) return undefined;
  return allowedValues.includes(trimmed) ? trimmed : undefined;
}

function readOptionalExportDir(value: string | undefined): Pick<TvcMallRuntimeConfig, 'exportDir'> {
  const exportDir = readString(value);
  return exportDir ? { exportDir } : {};
}
