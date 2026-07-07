import { describe, expect, it } from 'vitest';
import { redactSensitiveData } from '../../src/security/redact.js';

describe('redactSensitiveData', () => {
  it('redacts token and password fields from objects', () => {
    const output = redactSensitiveData({
      access_token: 'eyJ.secret.access',
      refreshToken: 'rft_secret_refresh',
      password: 'plain-password',
      nested: {
        token: 'nested-token'
      }
    });

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('eyJ.secret.access');
    expect(output).not.toContain('rft_secret_refresh');
    expect(output).not.toContain('plain-password');
    expect(output).not.toContain('nested-token');
  });

  it('masks emails and phone-like values in strings', () => {
    const output = redactSensitiveData('customer buyer@example.com phone +1 415 555 0198 token Bearer abc.def.ghi');

    expect(output).toContain('b***@example.com');
    expect(output).toContain('[PHONE_REDACTED]');
    expect(output).toContain('Bearer [REDACTED]');
    expect(output).not.toContain('buyer@example.com');
    expect(output).not.toContain('415 555 0198');
    expect(output).not.toContain('abc.def.ghi');
  });

  it('handles undefined values safely', () => {
    expect(redactSensitiveData(undefined)).toBe('undefined');
  });

});
