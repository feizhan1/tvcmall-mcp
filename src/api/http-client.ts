import type { StoredAuthSession } from '../storage/token-store.js';

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export type JsonObject = Record<string, unknown>;

export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
  }

  protected createUrl(path: string, params: Record<string, string | undefined> = {}): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  protected authHeaders(session: StoredAuthSession, json = false): Record<string, string> {
    if (!session.accessToken) {
      throw new Error('HTTP API request requires a login access token');
    }

    return {
      Accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Authorization: session.accessToken
    };
  }

  protected async readJson(response: Response, context: string): Promise<JsonObject> {
    if (!response.ok) {
      throw new Error(`${context} failed: ${response.status}`);
    }

    const parsed = await response.json() as unknown;
    if (!isJsonObject(parsed)) {
      throw new Error(`${context} response must be a JSON object`);
    }
    return parsed;
  }
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
