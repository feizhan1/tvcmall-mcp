import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readDocs = (paths: string[]) =>
  paths.map((path) => readFileSync(path, 'utf8')).join('\n');

const currentDocs = readDocs([
  'README.md',
  'AGENTS.md',
  'docs/api-contract.md',
  'docs/mvp-scope.md',
  'docs/harness.md',
  'docs/remote-streamable-http-mcp-architecture.md',
  'docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md',
  'docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md',
  'docs/superpowers/plans/2026-07-20-webapi-pat-auth.md',
]);

describe('remote Streamable HTTP documentation', () => {
  it('documents the WebApi PAT authorization boundary', () => {
    for (const term of [
      'tmcp_v1_{tokenId}.{secret}',
      'TVCMALL_WEBAPI_BASE_URL',
      'catalog.read',
      'order.read',
      'Streamable HTTP',
      'ApplicationServices',
    ]) {
      expect(currentDocs).toContain(term);
    }
  });

  it('contains architecture and data-flow diagrams with session and error semantics', () => {
    const architecture = readFileSync(
      'docs/remote-streamable-http-mcp-architecture.md',
      'utf8',
    );

    expect(architecture).toContain('## 2. 技术架构图');
    expect(architecture).toContain('## 5. 数据流转图');
    expect(architecture.match(/```mermaid/g)).toHaveLength(2);
    expect(architecture).toContain('Mcp-Session-Id');
    expect(architecture).toMatch(/401[\s\S]*AUTH_REQUIRED/);
    expect(architecture).toMatch(/403[\s\S]*PERMISSION_DENIED/);
    expect(architecture).toMatch(/429[\s\S]*RATE_LIMITED/);
    expect(architecture).toMatch(/5xx[\s\S]*API_UNAVAILABLE/);
  });

  it('does not advertise local login or file export from the README', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).not.toContain('npx @tvcmall/mcp login');
    expect(readme).not.toContain('tvcmall_export_orders');
    expect(readme).not.toContain('TVCMALL_EXPORT_DIR');
  });

  it('does not retain the superseded independent verification model', () => {
    const forbiddenTerms = [
      `TVCMALL_API_KEY_${'VERIFY_URL'}`,
      `upstream${'AccessToken'}`,
      `HttpApiKey${'Verifier'}`,
      `apiKey${'Verify'}`,
      `/api/mcp/auth/${'verify'}`,
    ];

    for (const term of forbiddenTerms) {
      expect(currentDocs).not.toContain(term);
    }
  });
});
