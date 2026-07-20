import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RequestAuthContext } from '../auth/request-auth-context.js';

export const AuthStatusOutputSchema = z.object({
  configured: z.boolean()
});

export type AuthStatus = z.infer<typeof AuthStatusOutputSchema>;

export function getAuthStatus(authContext?: RequestAuthContext): AuthStatus;
export function getAuthStatus(legacyTokenStore?: unknown, legacyOptions?: unknown): AuthStatus;
export function getAuthStatus(
  authContextOrLegacy?: RequestAuthContext | unknown,
  _legacyOptions?: unknown
): AuthStatus {
  return { configured: isRequestAuthContext(authContextOrLegacy) };
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
    && typeof (value as RequestAuthContext).pat === 'string'
    && (value as RequestAuthContext).pat.length > 0;
}
