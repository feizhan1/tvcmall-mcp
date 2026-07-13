import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RequestAuthContext } from '../auth/request-auth-context.js';

export const AuthStatusOutputSchema = z.object({
  logged_in: z.boolean(),
  display_name: z.string().optional(),
  customer_email: z.string().email().optional(),
  scopes: z.array(z.string())
});

export type AuthStatus = z.infer<typeof AuthStatusOutputSchema>;

export function getAuthStatus(authContext?: RequestAuthContext): AuthStatus;
export function getAuthStatus(legacyTokenStore?: unknown, legacyOptions?: unknown): AuthStatus;
export function getAuthStatus(
  authContextOrLegacy?: RequestAuthContext | unknown,
  _legacyOptions?: unknown
): AuthStatus {
  if (!isRequestAuthContext(authContextOrLegacy)) {
    return {
      logged_in: false,
      scopes: []
    };
  }

  return {
    logged_in: true,
    display_name: authContextOrLegacy.displayName,
    scopes: [...authContextOrLegacy.scopes]
  };
}

export function createAuthStatusToolResult(authContext?: RequestAuthContext): CallToolResult;
export function createAuthStatusToolResult(legacyTokenStore?: unknown, legacyOptions?: unknown): CallToolResult;
export function createAuthStatusToolResult(
  authContextOrLegacy?: RequestAuthContext | unknown,
  _legacyOptions?: unknown
): CallToolResult {
  const status = getAuthStatus(isRequestAuthContext(authContextOrLegacy) ? authContextOrLegacy : undefined);

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

function isRequestAuthContext(value: unknown): value is RequestAuthContext {
  return typeof value === 'object'
    && value !== null
    && 'customerId' in value
    && 'displayName' in value
    && 'upstreamAccessToken' in value
    && 'expiresAt' in value
    && 'apiKeyFingerprint' in value
    && Array.isArray((value as RequestAuthContext).scopes);
}
