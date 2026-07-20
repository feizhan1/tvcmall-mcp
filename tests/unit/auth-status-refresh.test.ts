import { describe, expect, it } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { getAuthStatus } from '../../src/tools/auth-status.js';

describe('getAuthStatus request-scoped behavior', () => {
  it('reports the request PAT configuration without local refresh or identity data', () => {
    expect(getAuthStatus(createPatAuthContext('tmcp_v1_token-id.secret-value'))).toEqual({ configured: true });
  });
});
