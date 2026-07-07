import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import type { TokenStore } from '../storage/token-store.js';

export const AuthStatusOutputSchema = z.object({
  logged_in: z.boolean(),
  customer_email: z.string().email().optional(),
  scopes: z.array(z.string())
});

export type AuthStatus = z.infer<typeof AuthStatusOutputSchema>;

export interface AuthStatusOptions {
  authClient?: AuthClient;
  now?: () => Date;
}

export async function getAuthStatus(
  tokenStore: TokenStore,
  options: AuthStatusOptions = {}
): Promise<AuthStatus> {
  const session = await getActiveSession(tokenStore, options);

  if (!session) {
    return {
      logged_in: false,
      scopes: []
    };
  }

  return {
    logged_in: true,
    customer_email: session.customer.email,
    scopes: [...session.scopes]
  };
}

export async function createAuthStatusToolResult(
  tokenStore: TokenStore,
  options: AuthStatusOptions = {}
): Promise<CallToolResult> {
  const status = await getAuthStatus(tokenStore, options);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(status, null, 2)
      }
    ],
    structuredContent: status
  };
}
