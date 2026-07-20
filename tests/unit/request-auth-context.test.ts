import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPatAuthContext, toStoredAuthSession } from '../../src/auth/request-auth-context.js';

describe('createPatAuthContext', () => {
  it('creates a request context from a trimmed MCP PAT', () => {
    const pat = 'tmcp_v1_token-id.secret-value';

    const context = createPatAuthContext(`  ${pat}\n`);

    expect(context).toEqual({
      pat,
      patFingerprint: createHash('sha256').update(pat).digest('hex')
    });
  });

  it.each([
    '',
    '   ',
    'website-token',
    'tmcp_v1_.secret-value',
    'tmcp_v1_token-id.',
    'tmcp_v1_token-id',
    'tmcp_v1_token-id.secret.extra',
    'tmcp_v1_token id.secret-value',
    'tmcp_v1_token-id.secret value'
  ])('rejects invalid PAT without exposing it: %s', (pat) => {
    let error: unknown;

    try {
      createPatAuthContext(pat);
    } catch (reason) {
      error = reason;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('AUTH_REQUIRED');
    if (pat.trim()) expect((error as Error).message).not.toContain(pat.trim());
  });
});

describe('toStoredAuthSession', () => {
  it('provides the PAT without inventing customer, scope, or expiry semantics', () => {
    const context = createPatAuthContext('tmcp_v1_token-id.secret-value');

    expect(toStoredAuthSession(context)).toEqual({
      customer: { id: '', email: '' },
      scopes: [],
      accessToken: context.pat
    });
  });
});
