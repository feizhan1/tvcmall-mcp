import type { StoredAuthSession, StoredCustomer } from '../storage/token-store.js';

export interface AuthProfile {
  customer: StoredCustomer;
  scopes: string[];
}

export interface AuthClient {
  login(): Promise<StoredAuthSession>;
  refresh(session: StoredAuthSession): Promise<StoredAuthSession>;
  logout(session: StoredAuthSession): Promise<void>;
  me(session: StoredAuthSession): Promise<AuthProfile>;
}
