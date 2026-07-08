import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HttpAuthClient } from '../../src/auth/http-auth-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function sampleResponse(name: string): Response {
  return new Response(readFileSync(new URL(`../../docs/external/api-responses/${name}`, import.meta.url), 'utf8'), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('HttpAuthClient', () => {
  it('posts login credentials to /user/login with the documented Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: {
        token: 'real-access-token',
        refresh_token: 'real-refresh-token',
        expires_in: 7200,
        user: {
          customer_id: 'cus_100',
          email: 'buyer@example.com',
          name: 'Buyer Account'
        },
        scopes: ['products:read', 'orders:read']
      }
    }));
    const client = new HttpAuthClient({
      baseUrl: 'https://api.tvcmall.test/',
      authorization: 'login-api-authorization-example',
      fetch: fetchMock,
      now: () => new Date('2026-07-08T04:00:00.000Z')
    });

    const session = await client.login({
      email: 'buyer@example.com',
      password: 'secret-password',
      rememberme: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tvcmall.test/user/login');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'login-api-authorization-example',
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'buyer@example.com',
      password: 'secret-password',
      rememberme: true
    });
    expect(session).toEqual({
      customer: {
        id: 'cus_100',
        email: 'buyer@example.com',
        name: 'Buyer Account'
      },
      scopes: ['products:read', 'orders:read'],
      accessToken: 'real-access-token',
      refreshToken: 'real-refresh-token',
      tokenType: 'Bearer',
      expiresAt: '2026-07-08T06:00:00.000Z'
    });
  });

  it('requires explicit email and password before calling the login API', async () => {
    const fetchMock = vi.fn();
    const client = new HttpAuthClient({
      baseUrl: 'https://api.tvcmall.test',
      authorization: 'login-api-authorization-example',
      fetch: fetchMock
    });

    await expect(client.login()).rejects.toThrow('email and password');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a redacted error when login API rejects the credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'Invalid password: secret-password' }, 401));
    const client = new HttpAuthClient({
      baseUrl: 'https://api.tvcmall.test',
      authorization: 'login-api-authorization-example',
      fetch: fetchMock
    });

    await expect(client.login({ email: 'buyer@example.com', password: 'secret-password' })).rejects.toThrow('TVCMall login failed: 401');
    await expect(client.login({ email: 'buyer@example.com', password: 'secret-password' })).rejects.not.toThrow('secret-password');
  });

  it('maps the real login response sample without requiring profile fields', async () => {
    const fetchMock = vi.fn(async () => sampleResponse('登录api.json'));
    const client = new HttpAuthClient({
      baseUrl: 'https://api.tvcmall.test/',
      authorization: 'login-api-authorization-example',
      fetch: fetchMock
    });

    const session = await client.login({
      email: 'buyer@example.com',
      password: 'secret-password'
    });

    expect(session).toMatchObject({
      customer: {
        id: 'buyer@example.com',
        email: 'buyer@example.com'
      },
      scopes: [],
      accessToken: 'sample-access-token',
      tokenType: 'Bearer'
    });
    expect(session.refreshToken).toBeUndefined();
  });
});
