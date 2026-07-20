import type { StoredAuthSession } from '../storage/token-store.js';

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type JsonObject = Record<string, unknown>;

export type WebApiErrorCode = 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'API_UNAVAILABLE';

const PAT_PATTERN = /^tmcp_v1_[^\s.]+\.[^\s.]+$/;

export class WebApiRequestError extends Error {
  constructor(readonly code: WebApiErrorCode) {
    super(code);
    this.name = 'WebApiRequestError';
  }
}

export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly timeoutMs: number;
  private readonly requestCleanups = new WeakMap<Response, () => void>();

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = readTimeoutMs(options.timeoutMs);
    const fetchImpl = options.fetch ?? fetch;
    this.fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const controller = new AbortController();
      const callerSignals = new Set<AbortSignal>();
      if (init?.signal) callerSignals.add(init.signal);
      if (typeof Request !== 'undefined' && input instanceof Request) callerSignals.add(input.signal);

      const abortFromCaller = () => controller.abort();
      for (const signal of callerSignals) {
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
      }

      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      timeout.unref?.();
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timeout);
        for (const signal of callerSignals) signal.removeEventListener('abort', abortFromCaller);
      };

      try {
        const response = await fetchImpl(input, { ...init, signal: controller.signal });
        this.requestCleanups.set(response, cleanup);
        return response;
      } catch {
        cleanup();
        throw new WebApiRequestError('API_UNAVAILABLE');
      }
    }) as typeof fetch;
  }

  protected createUrl(path: string, params: Record<string, string | undefined> = {}): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  protected authHeaders(session: StoredAuthSession, json = false): Record<string, string> {
    if (!session.accessToken || !PAT_PATTERN.test(session.accessToken)) {
      throw new WebApiRequestError('AUTH_REQUIRED');
    }

    return {
      Accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.accessToken}`
    };
  }

  protected async readJson(response: Response, context: string): Promise<JsonObject> {
    try {
      if (!response.ok) {
        throw new WebApiRequestError(webApiErrorCodeForStatus(response.status));
      }

      let parsed: unknown;
      try {
        parsed = await response.json() as unknown;
      } catch {
        throw new WebApiRequestError('API_UNAVAILABLE');
      }
      if (!isJsonObject(parsed)) {
        throw new Error(`${context} response must be a JSON object`);
      }
      return parsed;
    } finally {
      this.requestCleanups.get(response)?.();
      this.requestCleanups.delete(response);
    }
  }
}

function readTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('HTTP client timeoutMs must be a positive safe integer');
  }
  return timeoutMs;
}

function webApiErrorCodeForStatus(status: number): WebApiErrorCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  return 'API_UNAVAILABLE';
}

export function unwrapPayload(body: JsonObject): JsonObject {
  const data = readField(body, 'data');
  if (isJsonObject(data)) return data;
  const result = readField(body, 'result');
  if (isJsonObject(result)) return result;
  return body;
}

export function firstArray(source: JsonObject, keys: string[]): JsonObject[] {
  for (const key of keys) {
    const value = readField(source, key);
    if (Array.isArray(value)) return value.filter(isJsonObject);
  }
  return [];
}

export function firstObject(source: JsonObject, keys: string[]): JsonObject | undefined {
  for (const key of keys) {
    const value = readField(source, key);
    if (isJsonObject(value)) return value;
  }
  return undefined;
}

export function readString(source: JsonObject, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = readField(source, key);
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

export function readNumber(source: JsonObject, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = readField(source, key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim().replace(/,/g, '');
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
      const leadingNumber = normalized.match(/^-?\d+(?:\.\d+)?/);
      if (leadingNumber) return Number(leadingNumber[0]);
    }
  }
  return fallback;
}

export function readInteger(source: JsonObject, keys: string[], fallback = 0): number {
  return Math.trunc(readNumber(source, keys, fallback));
}

export function readStringArray(source: JsonObject, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = readField(source, key);
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    if (typeof value === 'string' && value.trim()) return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  }
  return undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readField(source: JsonObject, key: string): unknown {
  if (Object.hasOwn(source, key)) return source[key];
  const normalizedKey = key.toLowerCase();
  const matchedKey = Object.keys(source).find((sourceKey) => sourceKey.toLowerCase() === normalizedKey);
  return matchedKey === undefined ? undefined : source[matchedKey];
}
