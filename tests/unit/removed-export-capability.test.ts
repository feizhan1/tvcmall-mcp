import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('removed order export capability', () => {
  it('does not advertise export as a package capability', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      description: string;
    };

    expect(packageJson.description).toContain('remote Streamable HTTP MCP server');
    expect(packageJson.description).toContain('read-only queries');
    expect(packageJson.description).toContain('PAT-authenticated TVCMall WebApi');
    expect(packageJson.description).not.toMatch(/export/i);
  });

  it('cleans stale export artifacts before rebuilding the package', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: { build: string };
    };
    const staleArtifacts = [
      'dist/tools/export-orders.js',
      'dist/tools/export-orders.js.map',
      'dist/tools/export-orders.d.ts',
      'dist/export/csv-exporter.js',
      'dist/export/csv-exporter.js.map',
      'dist/export/csv-exporter.d.ts'
    ];

    expect(packageJson.scripts.build).toContain("rmSync('dist'");
    for (const artifact of staleArtifacts) {
      expect(existsSync(artifact), artifact).toBe(false);
    }
  });

  it('does not retain the export tool or file exporter implementation', () => {
    expect(existsSync('src/tools/export-orders.ts')).toBe(false);
    expect(existsSync('src/export/csv-exporter.ts')).toBe(false);

    const toolRegistry = readFileSync('src/app/register-tools.ts', 'utf8');
    expect(toolRegistry).not.toContain('tvcmall_export_orders');
  });

  it('does not retain export runtime configuration', () => {
    const runtimeConfig = readFileSync('src/config/runtime-config.ts', 'utf8');
    expect(runtimeConfig).not.toContain('TVCMALL_EXPORT_DIR');
    expect(runtimeConfig).not.toContain('TVCMALL_EXPORT_TTL_MS');
  });

  it('does not retain export-only errors or fake scopes', () => {
    const mcpErrors = readFileSync('src/errors/mcp-errors.ts', 'utf8');
    const fakeAuthClient = readFileSync('src/auth/fake-auth-client.ts', 'utf8');

    expect(mcpErrors).not.toContain('EXPORT_TOO_LARGE');
    expect(fakeAuthClient).not.toContain('orders:export');
  });

  it('does not expect the export tool in the stdio integration fixture', () => {
    const stdioIntegration = readFileSync('tests/integration/mcp-stdio.test.ts', 'utf8');

    expect(stdioIntegration).not.toContain('tvcmall_export_orders');
  });

  it('does not present export rules as a current contract in the implementation index', () => {
    const implementationIndex = readFileSync(
      'docs/tvcmall-customer-mcp-v0.1-implementation.md',
      'utf8'
    );

    expect(implementationIndex).toContain('PAT header');
    expect(implementationIndex).toContain('WebApi routes');
    expect(implementationIndex).not.toContain('订单导出契约');
    expect(implementationIndex).not.toContain('导出规则');
  });
});
