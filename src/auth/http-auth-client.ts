import type { AuthClient, AuthLoginInput, AuthProfile } from './auth-client.js';
import type { StoredAuthSession, StoredCustomer } from '../storage/token-store.js';

export interface HttpAuthClientOptions {
  baseUrl: string;
  authorization?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

type JsonObject = Record<string, unknown>;

export class HttpAuthClient implements AuthClient {
  private readonly baseUrl: string;
  private readonly authorization?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: HttpAuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.authorization = options.authorization?.trim() || undefined;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async login(input?: AuthLoginInput): Promise<StoredAuthSession> {
    if (!input?.email || !input.password) {
      throw new Error('HTTP login requires explicit email and password');
    }

    const response = await this.fetchImpl(`${this.baseUrl}/user/login`, {
      method: 'POST',
      headers: this.createJsonHeaders(),
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        rememberme: input.rememberme ?? true
      })
    });

    if (!response.ok) {
      throw new Error(`TVCMall login failed: ${response.status}`);
    }

    const body = await readJsonObject(response);
    return this.mapLoginResponse(body, input.email);
  }

  async refresh(_session: StoredAuthSession): Promise<StoredAuthSession> {
    throw new Error('HTTP auth refresh is not implemented because the login OpenAPI document only defines /user/login');
  }

  async logout(_session: StoredAuthSession): Promise<void> {
    // The provided login OpenAPI document does not define a logout endpoint.
  }

  async me(session: StoredAuthSession): Promise<AuthProfile> {
    return {
      customer: session.customer,
      scopes: [...session.scopes]
    };
  }

  private createJsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    if (this.authorization) {
      headers.Authorization = this.authorization;
    }

    return headers;
  }

  private mapLoginResponse(body: JsonObject, fallbackEmail: string): StoredAuthSession {
    const payload = unwrapDataObject(body);
    const accessToken = readString(payload, ['access_token', 'accessToken', 'token', 'authorization']);

    if (!accessToken) {
      throw new Error('TVCMall login response missing access token');
    }

    const expiresIn = readNumber(payload, ['expires_in', 'expiresIn', 'expire', 'expires']);

    return {
      customer: mapCustomer(payload, fallbackEmail),
      scopes: readStringArray(payload, ['scopes', 'scope']) ?? [],
      accessToken,
      refreshToken: readString(payload, ['refresh_token', 'refreshToken']),
      tokenType: readString(payload, ['token_type', 'tokenType']) ?? 'Bearer',
      expiresAt: expiresIn ? new Date(this.now().getTime() + expiresIn * 1000).toISOString() : undefined
    };
  }
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  const parsed = await response.json() as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error('TVCMall login response must be a JSON object');
  }
  return parsed;
}

function unwrapDataObject(body: JsonObject): JsonObject {
  const data = body.data;
  return isJsonObject(data) ? data : body;
}

function mapCustomer(payload: JsonObject, fallbackEmail: string): StoredCustomer {
  const source = firstJsonObject(payload, ['customer', 'user', 'userInfo', 'member']) ?? payload;
  const email = readString(source, ['email', 'mail']) ?? fallbackEmail;

  return {
    id: readString(source, ['id', 'customer_id', 'customerId', 'user_id', 'userId', 'uid']) ?? email,
    email,
    name: readString(source, ['name', 'nickname', 'nick_name', 'full_name', 'fullName'])
  };
}

function firstJsonObject(source: JsonObject, keys: string[]): JsonObject | undefined {
  for (const key of keys) {
    const value = source[key];
    if (isJsonObject(value)) return value;
  }
  return undefined;
}

function readString(source: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(source: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function readStringArray(source: JsonObject, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
    }
  }
  return undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
