import { createHash } from 'node:crypto';

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
