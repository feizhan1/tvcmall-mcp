const SENSITIVE_KEYS = new Set([
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'password',
  'token',
  'authorization'
]);

export function redactSensitiveData(value: unknown): string {
  const raw = typeof value === 'string' ? value : stringifyWithRedactedKeys(value);
  return maskFreeText(raw ?? String(value));
}

function stringifyWithRedactedKeys(value: unknown): string | undefined {
  return JSON.stringify(
    value,
    (key, nestedValue: unknown) => {
      const normalizedKey = key.toLowerCase().replace(/[-\s]/g, '');
      return SENSITIVE_KEYS.has(normalizedKey) ? '[REDACTED]' : nestedValue;
    },
    2
  );
}

function maskFreeText(value: string): string {
  return value
    .replace(/Bearer\s+([A-Za-z0-9._~+/-]+=*)/gi, 'Bearer [REDACTED]')
    .replace(/\b([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1***@$2')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE_REDACTED]');
}
