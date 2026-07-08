import type { StoredAuthSession, TokenStore } from '../storage/token-store.js';

export class MemoryTokenStore implements TokenStore {
  public savedSession: StoredAuthSession | null = null;
  public cleared = false;

  constructor(public session: StoredAuthSession | null = null) {}

  async getSession(): Promise<StoredAuthSession | null> {
    return this.session;
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    this.savedSession = session;
    this.session = session;
  }

  async clearSession(): Promise<void> {
    this.cleared = true;
    this.session = null;
  }
}
