import type { AuthClient } from './auth-client.js';
import type { StoredAuthSession, TokenStore } from '../storage/token-store.js';

export interface ActiveSessionOptions {
  authClient?: AuthClient;
  now?: () => Date;
}

export async function getActiveSession(
  tokenStore: TokenStore,
  options: ActiveSessionOptions = {}
): Promise<StoredAuthSession | null> {
  const session = await tokenStore.getSession();

  if (!session) {
    return null;
  }

  if (!isExpired(session, options.now?.() ?? new Date())) {
    return session;
  }

  if (!options.authClient) {
    return session;
  }

  try {
    const refreshedSession = await options.authClient.refresh(session);
    await tokenStore.saveSession(refreshedSession);
    return refreshedSession;
  } catch {
    await tokenStore.clearSession();
    return null;
  }
}

function isExpired(session: StoredAuthSession, now: Date): boolean {
  if (!session.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();
}
