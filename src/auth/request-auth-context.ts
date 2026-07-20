import { createHash } from 'node:crypto';
import type { StoredAuthSession } from '../storage/token-store.js';

export interface RequestAuthContext {
  pat: string;
  patFingerprint: string;
}

const PAT_PATTERN = /^tmcp_v1_[^\s.]+\.[^\s.]+$/;

export function createPatAuthContext(pat: string): RequestAuthContext {
  const normalizedPat = pat.trim();
  if (!PAT_PATTERN.test(normalizedPat)) {
    throw new Error('AUTH_REQUIRED: 缺少或无效的 TVCMall MCP PAT');
  }

  return {
    pat: normalizedPat,
    patFingerprint: createHash('sha256').update(normalizedPat).digest('hex')
  };
}

export function toStoredAuthSession(authContext: RequestAuthContext): StoredAuthSession {
  return {
    customer: {
      id: '',
      email: ''
    },
    scopes: [],
    accessToken: authContext.pat
  };
}
