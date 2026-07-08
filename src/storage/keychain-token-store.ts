import * as keytarModule from 'keytar';
import { z } from 'zod';
import type { StoredAuthSession, TokenStore } from './token-store.js';

export interface CredentialStoreAdapter {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface KeychainTokenStoreOptions {
  adapter?: unknown;
  serviceName?: string;
  accountName?: string;
}

const DEFAULT_SERVICE_NAME = 'tvcmall-mcp';
const DEFAULT_ACCOUNT_NAME = 'auth-session';

const storedAuthSessionSchema = z.object({
  customer: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional()
  }),
  scopes: z.array(z.string()),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenType: z.string().optional(),
  expiresAt: z.string().optional()
});

export function resolveCredentialStoreAdapter(adapterModule: unknown): CredentialStoreAdapter {
  if (isCredentialStoreAdapter(adapterModule)) {
    return adapterModule;
  }

  if (
    adapterModule &&
    typeof adapterModule === 'object' &&
    'default' in adapterModule &&
    isCredentialStoreAdapter((adapterModule as { default: unknown }).default)
  ) {
    return (adapterModule as { default: CredentialStoreAdapter }).default;
  }

  throw new TypeError('System credential store adapter is unavailable');
}

export class KeychainTokenStore implements TokenStore {
  private readonly adapter: CredentialStoreAdapter;
  private readonly serviceName: string;
  private readonly accountName: string;

  constructor(options: KeychainTokenStoreOptions = {}) {
    this.adapter = resolveCredentialStoreAdapter(options.adapter ?? keytarModule);
    this.serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;
    this.accountName = options.accountName ?? DEFAULT_ACCOUNT_NAME;
  }

  async getSession(): Promise<StoredAuthSession | null> {
    let raw: string | null;

    try {
      raw = await this.adapter.getPassword(this.serviceName, this.accountName);
    } catch {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      return storedAuthSessionSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async saveSession(session: StoredAuthSession): Promise<void> {
    const normalized = storedAuthSessionSchema.parse(session);
    await this.adapter.setPassword(this.serviceName, this.accountName, JSON.stringify(normalized));
  }

  async clearSession(): Promise<void> {
    try {
      await this.adapter.deletePassword(this.serviceName, this.accountName);
    } catch {
      // Clearing local auth should be idempotent even if the system keychain is unavailable.
    }
  }
}

function isCredentialStoreAdapter(value: unknown): value is CredentialStoreAdapter {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CredentialStoreAdapter).getPassword === 'function' &&
    typeof (value as CredentialStoreAdapter).setPassword === 'function' &&
    typeof (value as CredentialStoreAdapter).deletePassword === 'function'
  );
}
