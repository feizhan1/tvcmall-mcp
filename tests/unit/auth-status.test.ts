import { describe, expect, it } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { getAuthStatus } from '../../src/tools/auth-status.js';

describe('getAuthStatus', () => {
  it('reports PAT as not configured when request auth context is missing', () => {
    expect(getAuthStatus()).toEqual({ configured: false });
  });

  it('reports only whether PAT is configured', () => {
    const pat = 'tmcp_v1_token-id.secret-value';
    const status = getAuthStatus(createPatAuthContext(pat));

    expect(status).toEqual({ configured: true });
    expect(JSON.stringify(status)).not.toContain(pat);
  });
});
