import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readDocs = (paths: string[]) =>
  paths.map((path) => readFileSync(path, 'utf8')).join('\n');

const readme = readFileSync('README.md', 'utf8');
const apiContract = readFileSync('docs/api-contract.md', 'utf8');
const architecture = readFileSync(
  'docs/remote-streamable-http-mcp-architecture.md',
  'utf8',
);
const remoteDesign = readFileSync(
  'docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md',
  'utf8',
);

const currentDocs = readDocs([
  'README.md',
  'AGENTS.md',
  'docs/api-contract.md',
  'docs/mvp-scope.md',
  'docs/harness.md',
  'docs/remote-streamable-http-mcp-architecture.md',
  'docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md',
  'docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md',
  'docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md',
  'docs/superpowers/plans/2026-07-20-webapi-pat-auth.md',
]);

describe('remote Streamable HTTP documentation', () => {
  it('documents the core Streamable HTTP PAT and WebApi boundary in each public document', () => {
    for (const document of [readme, apiContract, architecture]) {
      for (const term of [
        'Streamable HTTP',
        'Authorization: Bearer',
        'tmcp_v1_{tokenId}.{secret}',
        'Mcp-Session-Id',
        'WebApi',
        'ApplicationServices',
        'RDS',
        'catalog.read',
        'order.read',
      ]) {
        expect(document).toContain(term);
      }
    }
  });

  it('contains architecture and data-flow diagrams with session and error semantics', () => {
    expect(architecture).toContain('## 2. 技术架构图');
    expect(architecture).toContain('## 5. 数据流转图');
    expect(architecture.match(/```mermaid/g)).toHaveLength(2);
    for (const term of [
      'flowchart',
      'sequenceDiagram',
      'Authorization: Bearer',
      'tools/list',
      'tools/call',
      'DELETE',
      'onclose',
      'idle TTL',
      'server close',
      'WebApi',
      'ApplicationServices',
      'RDS',
    ]) {
      expect(architecture).toContain(term);
    }
    expect(architecture).toMatch(/401[\s\S]*AUTH_REQUIRED/);
    expect(architecture).toMatch(/403[\s\S]*PERMISSION_DENIED/);
    expect(architecture).toMatch(/429[\s\S]*RATE_LIMITED/);
    expect(architecture).toMatch(/5xx[\s\S]*API_UNAVAILABLE/);
  });

  it('does not advertise local login or file export from the README', () => {
    const removedExportIdentifiers = [
      ['tvcmall', 'export', 'orders'].join('_'),
      ['TVCMALL', 'EXPORT', 'DIR'].join('_'),
      ['orders', 'export'].join(':'),
    ];

    expect(readme).not.toContain('npx @tvcmall/mcp login');
    for (const identifier of removedExportIdentifiers) {
      expect(currentDocs).not.toContain(identifier);
    }
  });

  it('uses JSON-RPC invalid params instead of a project validation error code', () => {
    const removedValidationCode = ['VALIDATION', 'ERROR'].join('_');

    expect(currentDocs).not.toContain(removedValidationCode);
    for (const document of [apiContract, architecture]) {
      expect(document).toContain('Invalid params');
      expect(document).toContain('-32602');
    }
  });

  it('documents the complete WebApi timeout contract in every current design', () => {
    for (const document of [
      readme,
      apiContract,
      architecture,
      remoteDesign,
    ]) {
      expect(document).toContain('15000');
      expect(document).toContain('1..2_147_483_647');
      expect(document).toContain('response headers');
      expect(document).toContain('JSON body');
      expect(document).toContain('非法或超限值回退到默认值');
      expect(document).toMatch(/超时[\s\S]{0,120}`API_UNAVAILABLE`/);
    }
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
