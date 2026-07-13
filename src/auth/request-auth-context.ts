import { createHash } from 'node:crypto';
import type { StoredAuthSession } from '../storage/token-store.js';

export interface RequestAuthContext {
  customerId: string;
  displayName: string;
  scopes: string[];
  upstreamAccessToken: string;
  expiresAt: string;
  apiKeyFingerprint: string;
}

export function fingerprintApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function toStoredAuthSession(authContext: RequestAuthContext): StoredAuthSession {
  return {
    customer: {
      id: authContext.customerId,
      email: '',
      name: authContext.displayName
    },
    scopes: [...authContext.scopes],
    accessToken: authContext.upstreamAccessToken,
    tokenType: 'Bearer',
    expiresAt: authContext.expiresAt
  };
}
