import type { StoredAuthSession } from '../storage/token-store.js';

export interface AuthClient {
  login(): Promise<StoredAuthSession>;
}
