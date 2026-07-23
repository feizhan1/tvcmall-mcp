export const WEBAPI_LOG_BODY_MAX_BYTES = 16 * 1024;
export const REDACTED_LOG_VALUE = '[REDACTED]';

export type SafeLogScalar = boolean | number | string | null;
export type SafeLogValue = SafeLogScalar | SafeLogValue[] | { [key: string]: SafeLogValue };
export type SafeLogRecord = Record<string, SafeLogValue>;

export interface BodyLogSnapshot {
  body?: string;
  bodyBytes?: number;
  bodyTruncated?: boolean;
  bodyType?: string;
}

export interface CompleteBodyLogSnapshot extends Required<Pick<BodyLogSnapshot, 'body' | 'bodyBytes' | 'bodyTruncated'>> {
  bodyType?: string;
}

const SENSITIVE_KEY_PARTS = [
  'accesskey',
  'accesstoken',
  'address',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'customername',
  'email',
  'fullname',
  'mobile',
  'password',
  'passwd',
  'phone',
  'recipient',
  'refreshtoken',
  'secret',
  'street',
  'telephone',
  'token'
] as const;

export function sanitizeHeaders(source: HeadersInit | undefined): Record<string, string> {
  if (!source) return {};

  const result: Record<string, string> = {};
  new Headers(source).forEach((value, key) => {
    result[key] = isSensitiveKey(key) ? REDACTED_LOG_VALUE : maskFreeText(value);
  });
  return result;
}

export function sanitizeQuery(url: URL): SafeLogRecord {
  const result: SafeLogRecord = {};
  for (const [key, value] of url.searchParams) {
    const sanitizedValue = isSensitiveKey(key) ? REDACTED_LOG_VALUE : maskFreeText(value);
    const existing = result[key];
    if (existing === undefined) {
      result[key] = sanitizedValue;
    } else if (Array.isArray(existing)) {
      existing.push(sanitizedValue);
    } else {
      result[key] = [existing, sanitizedValue];
    }
  }
  return result;
}

export function createBodySnapshot(raw: string): CompleteBodyLogSnapshot {
  const redacted = redactBody(raw);
  const { value, truncated } = truncateUtf8(redacted, WEBAPI_LOG_BODY_MAX_BYTES);
  return {
    body: value,
    bodyBytes: utf8ByteLength(raw),
    bodyTruncated: truncated
  };
}

export function createRequestBodySnapshot(body: BodyInit | null | undefined): BodyLogSnapshot {
  if (body === null || body === undefined) return {};
  if (typeof body === 'string') return { ...createBodySnapshot(body), bodyType: 'text' };
  if (body instanceof URLSearchParams) return { ...createBodySnapshot(body.toString()), bodyType: 'URLSearchParams' };
  if (body instanceof Blob) return { bodyBytes: body.size, bodyType: 'Blob' };
  if (body instanceof FormData) return { bodyType: 'FormData' };
  if (body instanceof ArrayBuffer) return { bodyBytes: body.byteLength, bodyType: 'ArrayBuffer' };
  if (ArrayBuffer.isView(body)) return { bodyBytes: body.byteLength, bodyType: body.constructor.name };
  return { bodyType: body.constructor?.name || 'unknown' };
}

function redactBody(raw: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(raw)));
  } catch {
    return maskFreeText(raw);
  }
}

function redactValue(value: unknown, key?: string): SafeLogValue {
  if (key && isSensitiveKey(key)) return REDACTED_LOG_VALUE;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return maskFreeText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (isRecord(value)) {
    const result: SafeLogRecord = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      result[nestedKey] = redactValue(nestedValue, nestedKey);
    }
    return result;
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function maskFreeText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
    .replace(/tmcp_v1_[^\s"',;]+/gi, REDACTED_LOG_VALUE)
    .replace(/\b(?:access[_-]?token|api[_-]?key|authorization|cookie|password|secret|token)\s*([=:])\s*[^\s&;,"']+/gi, (_match, separator: string) => `${separator}${REDACTED_LOG_VALUE}`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_LOG_VALUE)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (matched) => isUuid(matched) ? matched : REDACTED_LOG_VALUE);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (utf8ByteLength(value) <= maxBytes) return { value, truncated: false };

  let bytes = 0;
  let result = '';
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return { value: result, truncated: true };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
