import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HTTP_CLIENT_SOURCE = readFileSync(new URL('../../src/api/http-client.ts', import.meta.url), 'utf8');
const SINGLETON_HELPERS = [
  'createRequestMetadata',
  'requestUrl',
  'normalizeRoute',
  'withTraceHeaders',
  'copyHeaders',
  'createFailureMetadata',
  'readAuthReason'
];

describe('http client source structure', () => {
  it.each(SINGLETON_HELPERS)('declares %s only once', (helperName) => {
    expect(HTTP_CLIENT_SOURCE.match(new RegExp(`function ${helperName}\\(`, 'g'))).toHaveLength(1);
  });
});
