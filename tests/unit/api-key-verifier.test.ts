import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiKeyVerificationRateLimitedError,
  ApiKeyVerificationUnavailableError,
  HttpApiKeyVerifier,
  InvalidApiKeyError
} from '../../src/auth/api-key-verifier.js';

function verificationResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    customer: { id: 'customer_123', displayName: 'TVCMall Buyer' },
    scopes: ['orders:read'],
    upstreamAccessToken: 'short-token',
    expiresAt: '2030-01-01T00:00:00.000Z',
    ...overrides
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpApiKeyVerifier', () => {
  it('uses a Bearer API key and maps a complete verification response', async () => {
    const fetchMock = vi.fn(async () => verificationResponse());
    const verifier = new HttpApiKeyVerifier({ verifyUrl: 'https://auth.test/verify', fetch: fetchMock });

    await expect(verifier.verify('user-api-key')).resolves.toEqual({
      customerId: 'customer_123',
      displayName: 'TVCMall Buyer',
      scopes: ['orders:read'],
      upstreamAccessToken: 'short-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      apiKeyFingerprint: createHash('sha256').update('user-api-key').digest('hex')
    });
    expect(fetchMock).toHaveBeenCalledWith('https://auth.test/verify', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Accept: 'application/json',
        Authorization: 'Bearer user-api-key'
      })
    }));
  });

  it.each([401, 403])('maps verification status %i to an invalid API Key error', async (status) => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      fetch: vi.fn(async () => new Response(null, { status }))
    });

    await expect(verifier.verify('revoked-api-key')).rejects.toBeInstanceOf(InvalidApiKeyError);
  });

  it('maps verification status 429 to a distinct rate-limited error with a safe retryAfter value', async () => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      fetch: vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '30' } }))
    });

    const error = await verifier.verify('user-api-key').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiKeyVerificationRateLimitedError);
    expect(error).not.toBeInstanceOf(ApiKeyVerificationUnavailableError);
    expect((error as ApiKeyVerificationRateLimitedError).retryAfter).toBe(30);
  });

  it.each([
    new Response(null, { status: 500 }),
    verificationResponse({ scopes: [] }),
    verificationResponse({ expiresAt: '2020-01-01T00:00:00.000Z' })
  ])('maps unavailable or invalid verification results to a safe unavailable error', async (response) => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      fetch: vi.fn(async () => response)
    });

    const error = await verifier.verify('user-api-key').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiKeyVerificationUnavailableError);
    expect((error as Error).message).not.toContain('user-api-key');
  });

  it('maps a network error to a safe unavailable error', async () => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      fetch: vi.fn(async () => { throw new Error('connection refused'); })
    });

    await expect(verifier.verify('user-api-key')).rejects.toBeInstanceOf(ApiKeyVerificationUnavailableError);
  });

  it('maps an AbortError caused by verification timeout to a safe unavailable error', async () => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      timeoutMs: 1,
      fetch: vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('verification request timed out');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }))
    });

    await expect(verifier.verify('user-api-key')).rejects.toBeInstanceOf(ApiKeyVerificationUnavailableError);
  });

  it.each([
    ['missing customer ID', { customer: { displayName: 'TVCMall Buyer' } }],
    ['blank customer ID', { customer: { id: '   ', displayName: 'TVCMall Buyer' } }],
    ['missing display name', { customer: { id: 'customer_123' } }],
    ['blank display name', { customer: { id: 'customer_123', displayName: '   ' } }],
    ['missing upstream access token', { upstreamAccessToken: undefined }],
    ['blank upstream access token', { upstreamAccessToken: '   ' }]
  ])('rejects a response with %s', async (_description, overrides) => {
    const verifier = new HttpApiKeyVerifier({
      verifyUrl: 'https://auth.test/verify',
      fetch: vi.fn(async () => verificationResponse(overrides))
    });

    await expect(verifier.verify('user-api-key')).rejects.toBeInstanceOf(ApiKeyVerificationUnavailableError);
  });
});
