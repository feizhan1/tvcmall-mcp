export interface StoredCustomer {
  id: string;
  email: string;
  name?: string;
}

export interface StoredAuthSession {
  customer: StoredCustomer;
  scopes: string[];
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
}

export interface TokenStore {
  getSession(): Promise<StoredAuthSession | null>;
  clearSession(): Promise<void>;
}

export class NullTokenStore implements TokenStore {
  async getSession(): Promise<StoredAuthSession | null> {
    return null;
  }

  async clearSession(): Promise<void> {}
}

export function createDefaultTokenStore(): TokenStore {
  return new NullTokenStore();
}
