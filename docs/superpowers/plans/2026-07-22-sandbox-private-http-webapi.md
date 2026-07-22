# Sandbox Private HTTP WebApi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 允许 sandbox 环境通过受限 loopback/RFC1918 HTTP 调用本地 WebApi，并提供不进入 Git 的 .env.local 默认配置和显式本地启动命令。

**Architecture:** loadRuntimeConfig() 先确定 API 环境，再让 WebApi URL 校验器按环境、协议和 hostname 决策；HTTPS 在所有环境可用，HTTP 仅对显式 sandbox 的受支持私网地址开放。Node.js 20 原生 --env-file 只用于新增 local scripts，生产 dev/start 继续依赖部署环境注入。

**Tech Stack:** Node.js 20、TypeScript、Vitest、Node URL、Node --env-file、Markdown。

---

### Task 1: 用失败测试定义环境感知 URL 契约

**Files:**
- Modify: tests/unit/runtime-config.test.ts

- [ ] **Step 1: 添加 sandbox 私网 HTTP 允许用例**

~~~ts
it.each([
  'http://localhost:8084/api/m',
  'http://127.0.0.2:8084/api/m',
  'http://10.20.30.40:8084/api/m',
  'http://172.16.0.1:8084/api/m',
  'http://172.31.255.254:8084/api/m',
  'http://192.168.1.16:8084/api/m',
  'http://[::1]:8084/api/m'
])('allows sandbox private HTTP WebApi URL %s', (webApiBaseUrl) => {
  expect(loadRuntimeConfig({
    TVCMALL_API_ENV: 'sandbox',
    TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl
  }).webApiBaseUrl).toBe(webApiBaseUrl);
});
~~~

- [ ] **Step 2: 添加生产/非私网拒绝用例**

~~~ts
it.each(['production', 'staging'])('rejects private HTTP in %s', (apiEnv) => {
  expect(() => loadRuntimeConfig({
    TVCMALL_API_ENV: apiEnv,
    TVCMALL_WEBAPI_BASE_URL: 'http://192.168.1.16:8084/api/m'
  })).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
});

it.each([
  'http://example.com/api/m',
  'http://localhost.example.com/api/m',
  'http://8.8.8.8/api/m',
  'http://169.254.169.254/api/m',
  'http://100.64.0.1/api/m',
  'http://172.15.255.255/api/m',
  'http://172.32.0.1/api/m'
])('rejects sandbox HTTP outside the private allowlist: %s', (webApiBaseUrl) => {
  expect(() => loadRuntimeConfig({
    TVCMALL_API_ENV: 'sandbox',
    TVCMALL_WEBAPI_BASE_URL: webApiBaseUrl
  })).toThrow(/TVCMALL_WEBAPI_BASE_URL/);
});
~~~

默认/非法环境也用相同私网 HTTP URL 断言按 production 拒绝。userinfo、query、fragment 用例同时增加 sandbox HTTP 样本，并断言错误不回显 URL 或 password。

- [ ] **Step 3: 运行测试并确认 RED**

~~~bash
npm test -- tests/unit/runtime-config.test.ts
~~~

Expected: sandbox 私网 HTTP 允许用例失败，因为当前校验器只接受 HTTPS。

### Task 2: 实现 sandbox loopback/RFC1918 HTTP 校验

**Files:**
- Modify: src/config/runtime-config.ts
- Test: tests/unit/runtime-config.test.ts

- [ ] **Step 1: 把最终 API 环境传入 URL 校验器**

~~~ts
const apiEnv = readEnum(env.TVCMALL_API_ENV, API_ENV_VALUES) ?? DEFAULT_RUNTIME_CONFIG.apiEnv;
return {
  webApiBaseUrl: readWebApiBaseUrl(env.TVCMALL_WEBAPI_BASE_URL, apiEnv),
  apiEnv,
  // 其余既有字段保持不变
};
~~~

- [ ] **Step 2: 实现 hostname allowlist**

~~~ts
function isSandboxHttpHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  const [first, second] = octets;
  return first === 127
    || first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}
~~~

Node URL 会把非标准 IPv4 数字写法规范化为点分十进制；普通 hostname 和非 loopback IPv6 不进入 allowlist。

- [ ] **Step 3: 实现协议、环境与敏感 URL 校验顺序**

~~~ts
function readWebApiBaseUrl(value: string | undefined, apiEnv: TvcMallApiEnv): string {
  const url = readString(value);
  if (!url) throw new Error('TVCMALL_WEBAPI_BASE_URL must be explicitly configured');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must be a valid URL');
  }
  if (/[?#]/.test(url)) {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must not include query parameters or fragments');
  }
  if (parsed.username || parsed.password) {
    throw new Error('TVCMALL_WEBAPI_BASE_URL must not include userinfo');
  }
  if (parsed.protocol === 'https:') return url;
  if (apiEnv === 'sandbox' && parsed.protocol === 'http:' && isSandboxHttpHost(parsed.hostname)) return url;
  throw new Error('TVCMALL_WEBAPI_BASE_URL must use HTTPS unless sandbox targets loopback or RFC1918');
}
~~~

- [ ] **Step 4: 运行测试并确认 GREEN，然后提交**

~~~bash
npm test -- tests/unit/runtime-config.test.ts
git add src/config/runtime-config.ts tests/unit/runtime-config.test.ts
git commit -m "feat: allow sandbox private HTTP WebApi"
~~~

Expected: runtime config tests 全部通过，用户提供的 /api/m URL 原样保留。

### Task 3: 添加项目级本地默认配置

**Files:**
- Modify: .gitignore
- Create: .env.example
- Create locally, ignored: .env.local
- Modify: package.json
- Create: tests/unit/local-env-config.test.ts

- [ ] **Step 1: 添加失败配置契约测试**

~~~ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('local environment configuration', () => {
  it('publishes a safe example and explicit local scripts', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    const example = readFileSync('.env.example', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(gitignore).toContain('!.env.example');
    expect(example).toContain('TVCMALL_API_ENV=sandbox');
    expect(example).toContain('TVCMALL_WEBAPI_BASE_URL=http://192.168.1.100:8084/api/m');
    expect(example).not.toContain('TVCMALL_API_KEY');
    expect(packageJson.scripts['dev:local']).toBe('node --env-file=.env.local --import tsx src/index.ts');
    expect(packageJson.scripts['start:local']).toBe('node --env-file=.env.local dist/index.js');
  });
});
~~~

- [ ] **Step 2: 运行测试并确认 RED**

~~~bash
npm test -- tests/unit/local-env-config.test.ts
~~~

Expected: FAIL，因为 .env.example 和 local scripts 尚不存在。

- [ ] **Step 3: 添加可跟踪模板、ignore 例外和 scripts**

.env.example：

~~~dotenv
TVCMALL_API_ENV=sandbox
TVCMALL_WEBAPI_BASE_URL=http://192.168.1.100:8084/api/m
TVCMALL_MCP_HOST=127.0.0.1
TVCMALL_MCP_PORT=8090
TVCMALL_MCP_PATH=/mcp
TVCMALL_DATA_SOURCE=real
~~~

.gitignore 在 .env.* 后增加 !.env.example。package.json 增加：

~~~json
"dev:local": "node --env-file=.env.local --import tsx src/index.ts",
"start:local": "node --env-file=.env.local dist/index.js"
~~~

- [ ] **Step 4: 创建不提交的 .env.local**

~~~dotenv
TVCMALL_API_ENV=sandbox
TVCMALL_WEBAPI_BASE_URL=http://192.168.1.16:8084/api/m
TVCMALL_MCP_HOST=127.0.0.1
TVCMALL_MCP_PORT=8090
TVCMALL_MCP_PATH=/mcp
TVCMALL_DATA_SOURCE=real
~~~

不得包含 TVCMALL_API_KEY。

- [ ] **Step 5: 运行测试、ignore 检查并提交可跟踪文件**

~~~bash
npm test -- tests/unit/local-env-config.test.ts
git check-ignore .env.local
git check-ignore -v .env.example
git add .gitignore .env.example package.json tests/unit/local-env-config.test.ts
git commit -m "chore: add local environment startup defaults"
~~~

Expected: 测试通过；.env.local 被忽略；.env.example 由否定规则取消忽略，不提交 .env.local。

### Task 4: 更新当前文档与契约测试

**Files:**
- Modify: tests/unit/remote-readme.test.ts
- Modify: README.md
- Modify: AGENTS.md
- Modify: docs/api-contract.md
- Modify: docs/mvp-scope.md
- Modify: docs/harness.md
- Modify: docs/remote-streamable-http-mcp-architecture.md
- Modify: tvcmall-webapi mcp开发接入说明文档.md

- [ ] **Step 1: 添加失败文档断言**

~~~ts
it('documents sandbox private HTTP without weakening production HTTPS', () => {
  for (const document of [readme, apiContract, architecture, authorityDoc]) {
    expect(document).toContain('TVCMALL_API_ENV');
    expect(document).toContain('sandbox');
    expect(document).toContain('RFC1918');
    expect(document).toContain('production');
    expect(document).toContain('staging');
    expect(document).toContain('HTTPS');
  }
  expect(readme).toContain('.env.local');
  expect(readme).toContain('npm run dev:local');
  expect(readme).not.toContain('TVCMALL_API_KEY=tmcp_v1_');
});
~~~

- [ ] **Step 2: 运行文档测试并确认 RED**

~~~bash
npm test -- tests/unit/remote-readme.test.ts
~~~

Expected: FAIL，因为当前文档仍声明所有环境只允许 HTTPS。

- [ ] **Step 3: 同步所有当前文档**

统一说明：HTTPS 在所有环境允许且 production/staging 强制使用；HTTP 仅在显式 sandbox 且 hostname 为 loopback/RFC1918 时允许；sandbox HTTP 只使用隔离网络和可撤销测试 PAT；userinfo/query/fragment、公共/链路本地/CGNAT HTTP 继续拒绝；.env.local 不提交且不含用户 PAT；npm run dev:local 显式读取本地文件，生产 npm start 仍由部署平台注入。

- [ ] **Step 4: 运行文档测试、残留搜索并提交**

~~~bash
npm test -- tests/unit/remote-readme.test.ts
rg -n "只允许 HTTPS|强制配置 HTTPS|非 HTTPS.*拒绝|must be an HTTPS" README.md AGENTS.md docs/api-contract.md docs/mvp-scope.md docs/harness.md docs/remote-streamable-http-mcp-architecture.md "tvcmall-webapi mcp开发接入说明文档.md"
git add README.md AGENTS.md docs tests/unit/remote-readme.test.ts "tvcmall-webapi mcp开发接入说明文档.md"
git commit -m "docs: document sandbox private WebApi access"
~~~

Expected: 文档测试通过；旧无条件 HTTPS 表述消失，production/staging HTTPS 约束保留。

### Task 5: 完整验证与本地启动 smoke test

**Files:**
- Verify only

- [ ] **Step 1: 运行完整质量门**

~~~bash
npm test
npm run typecheck
npm run build
npm test -- tests/integration/mcp-streamable-http.test.ts tests/integration/mcp-stdio.test.ts
~~~

Expected: 0 failed，typecheck/build exit 0。

- [ ] **Step 2: 使用 .env.local 启动并验证 health**

~~~bash
TVCMALL_MCP_PORT=18090 node --env-file=.env.local dist/index.js >/tmp/tvcmall-mcp-local-smoke.log 2>&1 &
server_pid=$!
curl --fail --silent http://127.0.0.1:18090/healthz
kill "$server_pid"
wait "$server_pid" || true
~~~

Expected: {"status":"ok"}，日志无 PAT 或启动错误。若端口已占用，换一个未占用端口重复。

- [ ] **Step 3: 安全和 Git 状态检查**

~~~bash
rg -n "TVCMALL_API_KEY=" .env.local .env.example README.md || true
git diff --check
git status --short
~~~

Expected: 无 PAT 赋值；.env.local 不出现在 status；diff check 通过。

