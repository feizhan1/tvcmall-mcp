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
const authorityDoc = readFileSync(
  'tvcmall-webapi mcp开发接入说明文档.md',
  'utf8',
);
const currentHeaderDesign = readFileSync(
  'docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md',
  'utf8',
);

const currentDocs = readDocs([
  'README.md',
  'AGENTS.md',
  'docs/api-contract.md',
  'docs/mvp-scope.md',
  'docs/harness.md',
  'docs/remote-streamable-http-mcp-architecture.md',
  'docs/superpowers/specs/2026-07-22-tvcmall-api-key-header-design.md',
  'tvcmall-webapi mcp开发接入说明文档.md',
]);

type WebApiHttpSecurityRequirement = {
  relationship: string;
  pattern: RegExp;
};

type WebApiHttpSecurityContract = {
  name: string;
  document: string;
  requirements: readonly WebApiHttpSecurityRequirement[];
};

const requiresWebApiHttpSecurity = (
  relationship: string,
  pattern: RegExp,
): WebApiHttpSecurityRequirement => ({ relationship, pattern });

const webApiHttpSecurityContracts: readonly WebApiHttpSecurityContract[] = [
  {
    name: 'README',
    document: readme,
    requirements: [
      requiresWebApiHttpSecurity(
        '开关默认关闭',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`/,
      ),
      requiresWebApiHttpSecurity(
        '仅 trim 后精确 true 启用',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP[\s\S]{0,100}value\?\.trim\(\) === 'true'/,
      ),
      requiresWebApiHttpSecurity(
        '默认 HTTP 仅限 sandbox loopback 或 RFC1918',
        /开关关闭时，只有显式 `TVCMALL_API_ENV=sandbox`[\s\S]{0,260}(?:localhost|loopback)[\s\S]{0,160}RFC1918/,
      ),
      requiresWebApiHttpSecurity(
        '显式开关允许所有环境与任意 host/port',
        /当开关严格设为 `true` 时，`production`、`staging`、`sandbox` 及其他环境[\s\S]{0,120}任意 host\/port[\s\S]{0,100}`http:\/\/`/,
      ),
      requiresWebApiHttpSecurity('HTTP 明文传输风险', /HTTP 会以明文传输 PAT、请求和响应/),
      requiresWebApiHttpSecurity(
        'URL 始终拒绝 userinfo、query 和 fragment',
        /无论开关状态，URL 都继续拒绝 userinfo、query 和 fragment/,
      ),
      requiresWebApiHttpSecurity(
        'MCP Client 到 /mcp 仍要求 HTTPS/TLS',
        /MCP Client 到 `\/mcp` 的 HTTPS\/TLS 要求/,
      ),
      requiresWebApiHttpSecurity('PAT 仍仅在当前 session 内存', /PAT 仅存在当前 session 内存的规则/),
      requiresWebApiHttpSecurity('日志仍强制脱敏', /日志、异常和 tool 输出的强制脱敏/),
    ],
  },
  {
    name: 'API contract',
    document: apiContract,
    requirements: [
      requiresWebApiHttpSecurity(
        '开关默认关闭',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`/,
      ),
      requiresWebApiHttpSecurity(
        '仅 trim 后精确 true 启用',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP[\s\S]{0,100}value\?\.trim\(\) === 'true'/,
      ),
      requiresWebApiHttpSecurity(
        '默认 HTTP 仅限 sandbox loopback 或 RFC1918',
        /开关关闭时，只有显式 `sandbox` 可使用 `http:\/\/`[\s\S]{0,220}(?:localhost|loopback)[\s\S]{0,160}RFC1918/,
      ),
      requiresWebApiHttpSecurity(
        '显式开关允许所有环境与任意 host/port',
        /开关严格设为 `true` 后，`production`、`staging`、`sandbox` 及其他环境[\s\S]{0,120}任意 host\/port[\s\S]{0,100}`http:\/\/`/,
      ),
      requiresWebApiHttpSecurity('HTTP 明文传输风险', /HTTP 会以明文传输 PAT、请求和响应/),
      requiresWebApiHttpSecurity(
        'URL 始终拒绝 userinfo、query 和 fragment',
        /无论开关和环境如何，base URL 都不得含 userinfo、query 或 fragment/,
      ),
      requiresWebApiHttpSecurity(
        'MCP Client 到 /mcp 仍要求 HTTPS/TLS',
        /MCP Client 到公网 `\/mcp` 的 HTTPS\/TLS 要求/,
      ),
      requiresWebApiHttpSecurity('PAT 仍仅在当前 session 内存', /PAT 仅存当前 session 内存的规则/),
      requiresWebApiHttpSecurity('日志仍强制脱敏', /日志、异常和 tool 输出的强制脱敏/),
    ],
  },
  {
    name: 'architecture',
    document: architecture,
    requirements: [
      requiresWebApiHttpSecurity(
        '开关默认关闭',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`/,
      ),
      requiresWebApiHttpSecurity(
        '仅 trim 后精确 true 启用',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP[\s\S]{0,100}value\?\.trim\(\) === 'true'/,
      ),
      requiresWebApiHttpSecurity(
        '默认 HTTP 仅限 sandbox loopback 或 RFC1918',
        /默认情况下，只有显式 `sandbox` 可使用 HTTP，hostname 仅限[\s\S]{0,220}(?:localhost|loopback)[\s\S]{0,160}RFC1918/,
      ),
      requiresWebApiHttpSecurity(
        '显式开关允许所有环境与任意 host/port',
        /显式将开关设为 `true` 后，`production`、`staging`、`sandbox` 及其他环境[\s\S]{0,120}任意 host\/port[\s\S]{0,100}HTTP WebApi URL/,
      ),
      requiresWebApiHttpSecurity('HTTP 明文传输风险', /PAT、请求和响应会经过明文链路/),
      requiresWebApiHttpSecurity(
        'URL 始终拒绝 userinfo、query 和 fragment',
        /无论开关状态，所有 URL 仍拒绝 userinfo、query 和 fragment/,
      ),
      requiresWebApiHttpSecurity(
        'MCP Client 到 /mcp 仍要求 HTTPS/TLS',
        /MCP Client 到 `\/mcp` 的 HTTPS\/TLS/,
      ),
      requiresWebApiHttpSecurity('PAT 仍仅在 session 内存', /PAT 仅限 session 内存/),
      requiresWebApiHttpSecurity('日志仍强制脱敏', /日志强制脱敏/),
    ],
  },
  {
    name: 'authority document',
    document: authorityDoc,
    requirements: [
      requiresWebApiHttpSecurity(
        '开关默认关闭',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP` 默认 `false`/,
      ),
      requiresWebApiHttpSecurity(
        '仅 trim 后精确 true 启用',
        /TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP[\s\S]{0,100}value\?\.trim\(\) === 'true'/,
      ),
      requiresWebApiHttpSecurity(
        '默认 HTTP 仅限 sandbox loopback 或 RFC1918',
        /开关关闭时，只有显式 `TVCMALL_API_ENV=sandbox`[\s\S]{0,260}(?:localhost|loopback)[\s\S]{0,160}RFC1918/,
      ),
      requiresWebApiHttpSecurity(
        '显式开关允许所有环境与任意 host/port',
        /开关严格设为 `true` 后，`production`、`staging`、`sandbox` 及其他环境[\s\S]{0,120}任意 host\/port[\s\S]{0,100}HTTP WebApi URL/,
      ),
      requiresWebApiHttpSecurity('HTTP 明文传输风险', /PAT、请求和响应会经过明文链路/),
      requiresWebApiHttpSecurity(
        'URL 始终拒绝 userinfo、query 和 fragment',
        /URL 一律不得带 userinfo、query 或 fragment/,
      ),
      requiresWebApiHttpSecurity(
        'MCP Client 到 /mcp 仍要求 HTTPS/TLS',
        /MCP Client 到 `\/mcp` 的 HTTPS\/TLS 要求/,
      ),
      requiresWebApiHttpSecurity('PAT 仍仅在 session 内存', /PAT 仅在 session 内存中的规则/),
      requiresWebApiHttpSecurity('日志仍强制脱敏', /日志、异常和 tool 输出的强制脱敏/),
    ],
  },
];

const supersededUnconditionalHttpsRules = [
  /`production`、`staging`、未设置环境或非法环境均强制 `HTTPS`/,
  /`production`、`staging`(?: 及回退的 `production`)? 必须使用 HTTPS WebApi URL/,
  /`TVCMALL_API_ENV=production` 或 `staging` 时，MCP Server 到 WebApi 必须使用 HTTPS/,
  /`production`、`staging`(?:（以及缺失或非法值回退后的 `production`）)?强制 HTTPS/,
  /-> production\/staging: HTTPS outbound allowlist only/,
];

describe('remote Streamable HTTP documentation', () => {
  it('documents the core Streamable HTTP PAT and WebApi boundary in each public document', () => {
    for (const document of [readme, apiContract, architecture]) {
      for (const term of [
        'Streamable HTTP',
        'TVCMALL_API_KEY',
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

  it('separates inbound API KEY from outbound WebApi Authorization', () => {
    for (const document of [readme, apiContract, architecture, authorityDoc]) {
      expect(document).toContain('TVCMALL_API_KEY');
      expect(document).toContain('Authorization: Bearer');
      expect(document).toContain('tmcp_v1_{tokenId}.{secret}');
    }
    expect(authorityDoc).not.toContain('process.env.TVCMALL_MCP_PAT');
    expect(currentDocs).not.toContain('Bearer ${TVCMALL_MCP_PAT}');
    expect(currentHeaderDesign).toContain('不兼容旧客户端');
  });

  it('marks superseded specifications and plans as archived', () => {
    for (const path of [
      'docs/superpowers/specs/2026-07-13-remote-streamable-http-mcp-design.md',
      'docs/superpowers/specs/2026-07-20-webapi-pat-auth-design.md',
      'docs/superpowers/plans/2026-07-13-remote-streamable-http-mcp.md',
      'docs/superpowers/plans/2026-07-20-webapi-pat-auth.md',
    ]) {
      expect(readFileSync(path, 'utf8')).toContain('历史归档');
    }
  });

  it('contains architecture and data-flow diagrams with session and error semantics', () => {
    expect(architecture).toContain('## 2. 技术架构图');
    expect(architecture).toContain('## 5. 数据流转图');
    expect(architecture.match(/```mermaid/g)).toHaveLength(2);
    for (const term of [
      'flowchart',
      'sequenceDiagram',
      'TVCMALL_API_KEY',
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

  it('locks the complete WebApi HTTP security contract in every public document', () => {
    expect(webApiHttpSecurityContracts).toHaveLength(4);

    for (const contract of webApiHttpSecurityContracts) {
      expect(contract.requirements).toHaveLength(9);
      for (const requirement of contract.requirements) {
        expect(
          contract.document.match(requirement.pattern),
          `${contract.name} 应说明：${requirement.relationship}`,
        ).not.toBeNull();
      }
      for (const supersededRule of supersededUnconditionalHttpsRules) {
        expect(contract.document).not.toMatch(supersededRule);
      }
    }
  });

  it('keeps the staging HTTP override example copyable', () => {
    expect(readme).toContain('http://113.108.60.83:8084/api');
    expect(readme).toContain(`export TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true
export TVCMALL_WEBAPI_BASE_URL=http://113.108.60.83:8084/api
docker compose -f compose.staging.yaml up -d`);
    expect(readme).toContain('.env.local');
    expect(readme).toContain('npm run dev:local');
    expect(readme).not.toContain('TVCMALL_API_KEY=tmcp_v1_');
  });

  it('documents detailed and redacted WebApi request diagnostics', () => {
    expect(readme).toContain('mcp_webapi_request_completed');
    expect(readme).toContain('webApiResponseBody');
    expect(readme).toContain('16 KiB');
    expect(readme).toContain('[REDACTED]');
    expect(apiContract).toContain('webApiResponseBodyState');
    expect(apiContract).toContain('webApiRequestHeaders');
    expect(authorityDoc).toContain('webApiResponseBody');
  });
});
