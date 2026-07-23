import { randomUUID } from 'node:crypto';
import type { StoredAuthSession } from '../storage/token-store.js';
import {
  createBodySnapshot,
  createRequestBodySnapshot,
  sanitizeHeaders,
  sanitizeQuery,
  type SafeLogRecord
} from '../security/webapi-log-sanitizer.js';

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  onWebApiRequestCompleted?: (event: WebApiRequestCompletedEvent) => void;
  timeoutMs?: number;
}

export type JsonObject = Record<string, unknown>;

export type WebApiErrorCode = 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'API_UNAVAILABLE';
export type WebApiAuthReason = 'scope_missing' | 'route_not_registered' | 'route_disabled';
export type WebApiAuthReasonState = 'accepted' | 'missing' | 'unrecognized';
export type WebApiFailurePhase = 'caller_cancelled' | 'http_response' | 'invalid_json' | 'network' | 'response_body' | 'timeout';
export type WebApiResponseBodyState = 'complete' | 'empty' | 'read_failed' | 'unavailable';

export interface WebApiRequestMetadata {
  normalizedRoute: string;
  traceId: string;
  webApiMethod: string;
}

export interface WebApiFailureMetadata extends WebApiRequestMetadata {
  authReason?: WebApiAuthReason;
  authReasonState?: WebApiAuthReasonState;
  webApiDurationMs?: number;
  webApiFailurePhase?: WebApiFailurePhase;
  webApiStatus?: number;
}

export interface WebApiRequestCompletedEvent extends WebApiRequestMetadata {
  authReason?: WebApiAuthReason;
  authReasonState?: WebApiAuthReasonState;
  errorCode?: WebApiErrorCode;
  outcome: 'error' | 'success';
  webApiRequestBody?: string;
  webApiRequestBodyBytes?: number;
  webApiRequestBodyTruncated?: boolean;
  webApiRequestBodyType?: string;
  webApiRequestHeaders: Record<string, string>;
  webApiRequestQuery: SafeLogRecord;
  webApiResponseBody?: string;
  webApiResponseBodyBytes?: number;
  webApiResponseBodyState: WebApiResponseBodyState;
  webApiResponseBodyTruncated?: boolean;
  webApiResponseHeaders?: Record<string, string>;
  webApiDurationMs: number;
  webApiFailurePhase?: WebApiFailurePhase;
  webApiStatus?: number;
}

interface TrackedRequestMetadata extends WebApiRequestMetadata {
  callerCancelled: boolean;
  startedAt: number;
  timeoutTriggered: boolean;
  webApiRequestBody?: string;
  webApiRequestBodyBytes?: number;
  webApiRequestBodyTruncated?: boolean;
  webApiRequestBodyType?: string;
  webApiRequestHeaders: Record<string, string>;
  webApiRequestQuery: SafeLogRecord;
}

const PAT_PATTERN = /^tmcp_v1_[^\s.]+\.[^\s.]+$/;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MCP_AUTH_REASON_HEADER = 'X-TVCMall-MCP-Auth-Reason';
const MCP_CLIENT_HEADER = 'X-TVCMall-MCP-Client';
const MCP_TRACE_ID_HEADER = 'X-TVCMall-MCP-Trace-Id';
const WEB_API_AUTH_REASONS = new Set<WebApiAuthReason>(['scope_missing', 'route_not_registered', 'route_disabled']);

export class WebApiRequestError extends Error {
  constructor(readonly code: WebApiErrorCode, readonly metadata?: WebApiFailureMetadata) {
    super(code);
    this.name = 'WebApiRequestError';
  }
}

export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly timeoutMs: number;
  private readonly onWebApiRequestCompleted?: (event: WebApiRequestCompletedEvent) => void;
  private readonly requestCleanups = new WeakMap<Response, () => void>();
  private readonly requestMetadata = new WeakMap<Response, TrackedRequestMetadata>();

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = readTimeoutMs(options.timeoutMs);
    this.onWebApiRequestCompleted = options.onWebApiRequestCompleted;
    const fetchImpl = options.fetch ?? fetch;
    this.fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const metadata = createRequestMetadata(input, init);
      const controller = new AbortController();
      const callerSignals = new Set<AbortSignal>();
      if (init?.signal) callerSignals.add(init.signal);
      if (typeof Request !== 'undefined' && input instanceof Request) callerSignals.add(input.signal);

      const abortFromCaller = () => {
        metadata.callerCancelled = true;
        controller.abort();
      };
      for (const signal of callerSignals) {
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
      }

      const timeout = setTimeout(() => {
        metadata.timeoutTriggered = true;
        controller.abort();
      }, this.timeoutMs);
      timeout.unref?.();
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timeout);
        for (const signal of callerSignals) signal.removeEventListener('abort', abortFromCaller);
      };

      try {
        const headers = withTraceHeaders(input, init?.headers, metadata);
        addRequestDiagnostics(metadata, requestUrl(input), init?.body, headers);
        const response = await fetchImpl(input, {
          ...init,
          headers,
          signal: controller.signal
        });
        this.requestCleanups.set(response, cleanup);
        this.requestMetadata.set(response, metadata);
        return response;
      } catch {
        cleanup();
        const failure = createRequestFailureMetadata(metadata, failurePhaseFor(metadata));
        this.emitFailure(failure, metadata, 'API_UNAVAILABLE', { webApiResponseBodyState: 'unavailable' });
        throw new WebApiRequestError('API_UNAVAILABLE', failure);
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

  protected async readJson(response: Response, _context: string): Promise<JsonObject> {
    const metadata = this.requestMetadata.get(response);
    try {
      const responseHeaders = sanitizeResponseHeaders(response);
      let rawBody: string;
      try {
        rawBody = await response.text();
      } catch {
        const responseDiagnostics = {
          ...(responseHeaders ? { webApiResponseHeaders: responseHeaders } : {}),
          webApiResponseBodyState: 'read_failed' as const
        };
        if (!response.ok) {
          const code = webApiErrorCodeForStatus(response.status);
          const failure = createFailureMetadata(response, metadata);
          if (failure && metadata) this.emitFailure(failure, metadata, code, responseDiagnostics);
          throw new WebApiRequestError(code, failure);
        }

        const failure = metadata && createRequestFailureMetadata(metadata, failurePhaseFor(metadata, 'response_body'));
        if (failure && metadata) this.emitFailure(failure, metadata, 'API_UNAVAILABLE', responseDiagnostics);
        throw new WebApiRequestError('API_UNAVAILABLE', failure);
      }

      const responseDiagnostics = {
        ...(responseHeaders ? { webApiResponseHeaders: responseHeaders } : {}),
        ...createResponseBodyDiagnostics(rawBody)
      };
      if (!response.ok) {
        const code = webApiErrorCodeForStatus(response.status);
        const failure = createFailureMetadata(response, metadata);
        if (failure && metadata) this.emitFailure(failure, metadata, code, responseDiagnostics);
        throw new WebApiRequestError(code, failure);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody) as unknown;
      } catch {
        const failure = metadata && createRequestFailureMetadata(metadata, 'invalid_json');
        if (failure && metadata) this.emitFailure(failure, metadata, 'API_UNAVAILABLE', responseDiagnostics);
        throw new WebApiRequestError('API_UNAVAILABLE', failure);
      }
      if (!isJsonObject(parsed)) {
        const failure = metadata && createRequestFailureMetadata(metadata, 'invalid_json');
        if (failure && metadata) this.emitFailure(failure, metadata, 'API_UNAVAILABLE', responseDiagnostics);
        throw new WebApiRequestError('API_UNAVAILABLE', failure);
      }
      if (metadata) this.emitRequestCompleted({
        ...publicMetadata(metadata),
        ...requestDiagnostics(metadata),
        ...responseDiagnostics,
        outcome: 'success',
        webApiDurationMs: Date.now() - metadata.startedAt,
        webApiStatus: response.status
      });
      return parsed;
    } finally {
      this.requestCleanups.get(response)?.();
      this.requestCleanups.delete(response);
      this.requestMetadata.delete(response);
    }
  }

  private emitRequestCompleted(event: WebApiRequestCompletedEvent): void {
    try {
      this.onWebApiRequestCompleted?.(event);
    } catch {
      // Observability must not change the WebApi result or stable error mapping.
    }
  }

  private emitFailure(
    failure: WebApiFailureMetadata,
    metadata: TrackedRequestMetadata,
    errorCode: WebApiErrorCode,
    responseDiagnostics: WebApiResponseDiagnostics
  ): void {
    this.emitRequestCompleted({
      ...failure,
      ...requestDiagnostics(metadata),
      ...responseDiagnostics,
      errorCode,
      outcome: 'error',
      webApiDurationMs: failure.webApiDurationMs ?? 0
    });
  }
}

function createRequestMetadata(input: URL | RequestInfo, init?: RequestInit): TrackedRequestMetadata {
  const url = requestUrl(input);
  return {
    callerCancelled: false,
    normalizedRoute: normalizeRoute(url.pathname),
    startedAt: Date.now(),
    traceId: randomUUID(),
    timeoutTriggered: false,
    webApiMethod: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
    webApiRequestHeaders: {},
    webApiRequestQuery: {}
  };
}

function requestUrl(input: URL | RequestInfo): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

function normalizeRoute(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
}

function withTraceHeaders(
  input: URL | RequestInfo,
  initHeaders: HeadersInit | undefined,
  metadata: WebApiRequestMetadata
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input instanceof Request) copyHeaders(headers, input.headers);
  copyHeaders(headers, initHeaders);
  headers[MCP_CLIENT_HEADER] = 'tvcmall-mcp-server';
  headers[MCP_TRACE_ID_HEADER] = metadata.traceId;
  return headers;
}

function copyHeaders(target: Record<string, string>, source: HeadersInit | undefined): void {
  if (!source) return;
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target[key] = value;
    });
    return;
  }
  if (Array.isArray(source)) {
    for (const [key, value] of source) target[key] = value;
    return;
  }
  Object.assign(target, source);
}

function createFailureMetadata(response: Response, metadata: TrackedRequestMetadata | undefined): WebApiFailureMetadata | undefined {
  if (!metadata) return undefined;
  const auth = response.status === 403 ? readAuthReason(response) : undefined;
  return {
    ...publicMetadata(metadata),
    ...(auth?.reason ? { authReason: auth.reason } : {}),
    ...(auth?.state ? { authReasonState: auth.state } : {}),
    webApiDurationMs: Date.now() - metadata.startedAt,
    webApiFailurePhase: 'http_response',
    webApiStatus: response.status
  };
}

function createRequestFailureMetadata(metadata: TrackedRequestMetadata, webApiFailurePhase: WebApiFailurePhase): WebApiFailureMetadata {
  return {
    ...publicMetadata(metadata),
    webApiDurationMs: Date.now() - metadata.startedAt,
    webApiFailurePhase
  };
}

function publicMetadata(metadata: TrackedRequestMetadata): WebApiRequestMetadata {
  return {
    normalizedRoute: metadata.normalizedRoute,
    traceId: metadata.traceId,
    webApiMethod: metadata.webApiMethod
  };
}

interface WebApiResponseDiagnostics {
  webApiResponseBody?: string;
  webApiResponseBodyBytes?: number;
  webApiResponseBodyState: WebApiResponseBodyState;
  webApiResponseBodyTruncated?: boolean;
  webApiResponseHeaders?: Record<string, string>;
}

function addRequestDiagnostics(
  metadata: TrackedRequestMetadata,
  url: URL,
  body: BodyInit | null | undefined,
  headers: HeadersInit
): void {
  const snapshot = createRequestBodySnapshot(body);
  metadata.webApiRequestHeaders = sanitizeHeaders(headers);
  metadata.webApiRequestQuery = sanitizeQuery(url);
  metadata.webApiRequestBody = snapshot.body;
  metadata.webApiRequestBodyBytes = snapshot.bodyBytes;
  metadata.webApiRequestBodyTruncated = snapshot.bodyTruncated;
  metadata.webApiRequestBodyType = snapshot.bodyType;
}

function requestDiagnostics(metadata: TrackedRequestMetadata): Pick<
  WebApiRequestCompletedEvent,
  'webApiRequestBody' | 'webApiRequestBodyBytes' | 'webApiRequestBodyTruncated' | 'webApiRequestBodyType' | 'webApiRequestHeaders' | 'webApiRequestQuery'
> {
  return {
    ...(metadata.webApiRequestBody === undefined ? {} : { webApiRequestBody: metadata.webApiRequestBody }),
    ...(metadata.webApiRequestBodyBytes === undefined ? {} : { webApiRequestBodyBytes: metadata.webApiRequestBodyBytes }),
    ...(metadata.webApiRequestBodyTruncated === undefined ? {} : { webApiRequestBodyTruncated: metadata.webApiRequestBodyTruncated }),
    ...(metadata.webApiRequestBodyType === undefined ? {} : { webApiRequestBodyType: metadata.webApiRequestBodyType }),
    webApiRequestHeaders: metadata.webApiRequestHeaders,
    webApiRequestQuery: metadata.webApiRequestQuery
  };
}

function createResponseBodyDiagnostics(rawBody: string): WebApiResponseDiagnostics {
  const snapshot = createBodySnapshot(rawBody);
  return {
    webApiResponseBody: snapshot.body,
    webApiResponseBodyBytes: snapshot.bodyBytes,
    webApiResponseBodyState: rawBody ? 'complete' : 'empty',
    webApiResponseBodyTruncated: snapshot.bodyTruncated
  };
}

function sanitizeResponseHeaders(response: Response): Record<string, string> | undefined {
  const headers = (response as unknown as { headers?: HeadersInit }).headers;
  return headers ? sanitizeHeaders(headers) : undefined;
}

function failurePhaseFor(metadata: TrackedRequestMetadata, fallback: 'network' | 'response_body' = 'network'): WebApiFailurePhase {
  if (metadata.timeoutTriggered) return 'timeout';
  if (metadata.callerCancelled) return 'caller_cancelled';
  return fallback;
}

function readAuthReason(response: Response): { reason?: WebApiAuthReason; state: WebApiAuthReasonState } {
  const headers = (response as unknown as { headers?: { get?(name: string): string | null } }).headers;
  const value = headers?.get?.(MCP_AUTH_REASON_HEADER);
  if (value === null || value === undefined) return { state: 'missing' };
  return WEB_API_AUTH_REASONS.has(value as WebApiAuthReason)
    ? { reason: value as WebApiAuthReason, state: 'accepted' }
    : { state: 'unrecognized' };
}

function readTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
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
