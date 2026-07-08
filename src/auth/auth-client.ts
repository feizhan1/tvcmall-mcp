import type { StoredAuthSession, StoredCustomer } from '../storage/token-store.js';

export interface AuthProfile {
  customer: StoredCustomer;
  scopes: string[];
}

export interface AuthLoginInput {
  email: string;
  password: string;
  rememberme?: boolean;
}

export interface AuthClient {
  login(input?: AuthLoginInput): Promise<StoredAuthSession>;
  refresh(session: StoredAuthSession): Promise<StoredAuthSession>;
  logout(session: StoredAuthSession): Promise<void>;
  me(session: StoredAuthSession): Promise<AuthProfile>;
}
