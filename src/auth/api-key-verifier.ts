import { z } from 'zod';
import { fingerprintApiKey, type RequestAuthContext } from './request-auth-context.js';

const verificationResponseSchema = z.object({
  customer: z.object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1)
  }),
  scopes: z.array(z.string().trim().min(1)).min(1),
  upstreamAccessToken: z.string().trim().min(1),
  expiresAt: z.iso.datetime({ offset: true }).refine((value) => Date.parse(value) > Date.now())
});

export interface ApiKeyVerifier {
  verify(apiKey: string): Promise<RequestAuthContext>;
}

export interface HttpApiKeyVerifierOptions {
  verifyUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class InvalidApiKeyError extends Error {
  constructor() {
    super('API Key 无效或无权使用 MCP');
    this.name = 'InvalidApiKeyError';
  }
}

export class ApiKeyVerificationUnavailableError extends Error {
  constructor() {
    super('API Key 验证服务暂不可用');
    this.name = 'ApiKeyVerificationUnavailableError';
  }
}

export class ApiKeyVerificationRateLimitedError extends Error {
  readonly retryAfter: number | undefined;

  constructor(retryAfter: number | undefined) {
    super('API Key 验证请求过于频繁');
    this.name = 'ApiKeyVerificationRateLimitedError';
    this.retryAfter = retryAfter;
  }
}

export class HttpApiKeyVerifier implements ApiKeyVerifier {
  private readonly verifyUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpApiKeyVerifierOptions) {
    this.verifyUrl = options.verifyUrl;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async verify(apiKey: string): Promise<RequestAuthContext> {
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) throw new InvalidApiKeyError();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.verifyUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${normalizedApiKey}`
        },
        signal: controller.signal
      });

      if (response.status === 401 || response.status === 403) {
        throw new InvalidApiKeyError();
      }
      if (response.status === 429) {
        throw new ApiKeyVerificationRateLimitedError(readRetryAfter(response.headers));
      }
      if (!response.ok) throw new ApiKeyVerificationUnavailableError();

      const body = await response.json();
      const parsed = verificationResponseSchema.safeParse(body);
      if (!parsed.success) throw new ApiKeyVerificationUnavailableError();

      return {
        customerId: parsed.data.customer.id,
        displayName: parsed.data.customer.displayName,
        scopes: parsed.data.scopes,
        upstreamAccessToken: parsed.data.upstreamAccessToken,
        expiresAt: parsed.data.expiresAt,
        apiKeyFingerprint: fingerprintApiKey(normalizedApiKey)
      };
    } catch (error) {
      if (error instanceof InvalidApiKeyError
        || error instanceof ApiKeyVerificationRateLimitedError
        || error instanceof ApiKeyVerificationUnavailableError) {
        throw error;
      }
      throw new ApiKeyVerificationUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readRetryAfter(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value?.trim()) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return Math.min(parsed, 3600);
}
