# Insecure WebApi HTTP Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过显式 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true` 配置，使任意运行环境可连接任意 HTTP WebApi URL，同时默认保持 HTTPS 约束。

**Architecture:** runtime config 负责严格解析开关并在 URL 协议校验时短路 HTTP host 限制；Compose 仅把部署环境的开关透传给容器；文档明确默认拒绝和启用后的明文传输风险。开关不会影响 PAT 内存生命周期、日志脱敏、URL userinfo/query/fragment 校验或 WebApi 错误映射。

**Tech Stack:** Node.js 20、TypeScript、Vitest、Docker Compose、Bash。

---

## 文件结构

- Modify: `src/config/runtime-config.ts` — 解析显式 HTTP 开关并调整 WebApi URL 校验。
- Modify: `tests/unit/runtime-config.test.ts` — 覆盖开关的默认、精确解析、各环境 HTTP 放行与 URL 安全边界。
- Modify: `compose.staging.yaml` — 将 stage 环境变量传入容器。
- Modify: `compose.production.yaml` — 将 production 环境变量传入容器。
- Modify: `tests/scripts/docker-compose.test.sh` — 验证 Compose 默认值与显式 true 均可渲染。
- Modify: `README.md` — 说明部署配置、默认行为与 HTTP 风险。
- Modify: `docs/api-contract.md` — 更新运行时、传输和验收契约。
- Modify: `docs/remote-streamable-http-mcp-architecture.md` — 更新下游 WebApi 信任边界。
- Modify: `tvcmall-webapi mcp开发接入说明文档.md` — 更新接入环境说明。
- Modify: `AGENTS.md` — 同步对 Agent 有约束力的 URL 校验规则。
- Modify: `tests/unit/remote-readme.test.ts` — 锁定公开文档中的开关说明。

### Task 1: 用严格布尔开关放行 HTTP WebApi URL

**Files:**
- Modify: `src/config/runtime-config.ts`
- Modify: `tests/unit/runtime-config.test.ts`

- [ ] **Step 1: 为默认关闭与精确值解析写失败测试**

在 `tests/unit/runtime-config.test.ts` 添加：

```ts
it.each([undefined, '', 'false', 'TRUE', '1', 'yes'])(
  'keeps insecure HTTP disabled for %s',
  (allowInsecureWebApiHttp) => {
    expect(() => loadRuntimeConfig({
      ...(allowInsecureWebApiHttp === undefined
        ? {}
        : { TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: allowInsecureWebApiHttp }),
      TVCMALL_API_ENV: 'staging',
      TVCMALL_WEBAPI_BASE_URL: 'http://113.108.60.83:8084/api'
    })).toThrow('TVCMALL_WEBAPI_BASE_URL requires TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true for HTTP');
  }
);

it.each(['production', 'staging', 'sandbox'])('allows public HTTP in %s only with the explicit override', (apiEnv) => {
  expect(loadRuntimeConfig({
    TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: 'true',
    TVCMALL_API_ENV: apiEnv,
    TVCMALL_WEBAPI_BASE_URL: 'http://113.108.60.83:8084/api'
  })).toMatchObject({
    allowInsecureWebApiHttp: true,
    apiEnv,
    webApiBaseUrl: 'http://113.108.60.83:8084/api'
  });
});
```

同时更新现有 `loads WebApi settings...` 和默认配置断言，要求运行时对象包含：

```ts
allowInsecureWebApiHttp: false
```

- [ ] **Step 2: 运行 runtime config 测试并确认失败**

Run: `npx vitest run tests/unit/runtime-config.test.ts`

Expected: FAIL，当前 production/staging 公网 HTTP 仍被拒绝，且 `allowInsecureWebApiHttp` 字段不存在。

- [ ] **Step 3: 扩展运行时配置类型和默认值**

在 `src/config/runtime-config.ts` 增加：

```ts
export interface TvcMallRuntimeConfig {
  allowInsecureWebApiHttp: boolean;
  // existing fields remain unchanged
}

export const DEFAULT_RUNTIME_CONFIG = {
  allowInsecureWebApiHttp: false,
  // existing defaults remain unchanged
};
```

新增严格 helper：

```ts
function readExactTrue(value: string | undefined): boolean {
  return value?.trim() === 'true';
}
```

在 `loadRuntimeConfig` 内只读取一次，并同时传给 URL 校验：

```ts
const allowInsecureWebApiHttp = readExactTrue(env.TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP);
return {
  webApiBaseUrl: readWebApiBaseUrl(env.TVCMALL_WEBAPI_BASE_URL, apiEnv, allowInsecureWebApiHttp),
  allowInsecureWebApiHttp,
  // existing fields
};
```

- [ ] **Step 4: 修改协议校验而不放松其他 URL 边界**

将函数签名改为：

```ts
function readWebApiBaseUrl(
  value: string | undefined,
  apiEnv: TvcMallApiEnv,
  allowInsecureWebApiHttp: boolean
): string
```

保留 userinfo/query/fragment 检查；协议分支改为：

```ts
if (parsed.protocol === 'https:') return url;
if (parsed.protocol === 'http:' && (allowInsecureWebApiHttp || (apiEnv === 'sandbox' && isSandboxHttpHost(parsed.hostname)))) {
  return url;
}
throw new Error('TVCMALL_WEBAPI_BASE_URL requires TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true for HTTP');
```

不要修改 `isSandboxHttpHost`，因为开关关闭时仍要维持原有 sandbox 私网 HTTP 行为。

- [ ] **Step 5: 增加 URL 安全回归断言**

在现有 userinfo/query/fragment 表驱动测试中增加 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: 'true'` 与
HTTP URL 输入，断言这些 URL 仍抛出原有通用错误并且错误字符串不包含用户、密码、query
value 或完整 URL。

- [ ] **Step 6: 运行 runtime config 测试和类型检查**

Run: `npx vitest run tests/unit/runtime-config.test.ts && npm run typecheck`

Expected: PASS；`true` 是唯一允许 public HTTP 的开关值，HTTPS 以及所有既有 URL 安全拒绝
规则保持通过。

- [ ] **Step 7: 提交 runtime config 改动**

```bash
git add src/config/runtime-config.ts tests/unit/runtime-config.test.ts
git commit -m "feat: 支持显式 HTTP WebApi 配置"
```

### Task 2: 将显式开关透传到 stage 与 production Compose

**Files:**
- Modify: `compose.staging.yaml`
- Modify: `compose.production.yaml`
- Modify: `tests/scripts/docker-compose.test.sh`

- [ ] **Step 1: 写入 Compose 渲染失败测试**

在 `tests/scripts/docker-compose.test.sh` 的 `assert_compose_file` 中，将渲染内容保存为：

```bash
local rendered
rendered=$(TVCMALL_MCP_IMAGE='registry.example/tvcmall/tvcmall-mcp:abc1234' \
  TVCMALL_WEBAPI_BASE_URL='https://webapi.example.com/api' \
  docker compose -f "$compose_file" config)
printf '%s\n' "$rendered" | rg --fixed-strings --quiet -- 'TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: "false"'

rendered=$(TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true \
  TVCMALL_MCP_IMAGE='registry.example/tvcmall/tvcmall-mcp:abc1234' \
  TVCMALL_WEBAPI_BASE_URL='http://113.108.60.83:8084/api' \
  docker compose -f "$compose_file" config)
printf '%s\n' "$rendered" | rg --fixed-strings --quiet -- 'TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: "true"'
```

保留现有 image、固定 API environment、healthcheck 和不包含 API key 的断言。

- [ ] **Step 2: 运行 Compose 脚本并确认新断言失败**

Run: `bash tests/scripts/docker-compose.test.sh`

Expected: FAIL，渲染后的环境变量中不存在 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP`。

- [ ] **Step 3: 更新两个 Compose 文件**

在每个 service 的 `environment` 下、`TVCMALL_WEBAPI_BASE_URL` 后插入：

```yaml
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: ${TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP:-false}
```

保持 `TVCMALL_API_ENV: staging` 与 `TVCMALL_API_ENV: production` 不变。

- [ ] **Step 4: 运行 Compose 脚本验证默认与覆盖值**

Run: `bash tests/scripts/docker-compose.test.sh`

Expected: PASS；两个 Compose 文件在未设置变量时传递 `false`，设置 true 时传递 `true`。

- [ ] **Step 5: 提交 Compose 改动**

```bash
git add compose.staging.yaml compose.production.yaml tests/scripts/docker-compose.test.sh
git commit -m "feat: 透传 HTTP WebApi 开关"
```

### Task 3: 更新公开契约、Agent 规则和部署说明

**Files:**
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/remote-streamable-http-mcp-architecture.md`
- Modify: `tvcmall-webapi mcp开发接入说明文档.md`
- Modify: `AGENTS.md`
- Modify: `tests/unit/remote-readme.test.ts`

- [ ] **Step 1: 写入文档契约失败测试**

在 `tests/unit/remote-readme.test.ts` 添加：

```ts
it('documents the explicit insecure HTTP WebApi override', () => {
  for (const document of [readme, apiContract, architecture, authorityDoc]) {
    expect(document).toContain('TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP');
  }
  expect(readme).toContain('http://113.108.60.83:8084/api');
  expect(apiContract).toContain('默认 `false`');
});
```

- [ ] **Step 2: 运行文档测试并确认失败**

Run: `npx vitest run tests/unit/remote-readme.test.ts`

Expected: FAIL，当前文档仍声明 production/staging 必须 HTTPS，且未列出开关。

- [ ] **Step 3: 更新 README 与 API 契约**

README 的 stage 示例改为：

```bash
export TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true
export TVCMALL_WEBAPI_BASE_URL=http://113.108.60.83:8084/api
docker compose -f compose.staging.yaml up -d
```

配置表增加：

```text
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP | false | 仅精确 true 时允许任意 HTTP WebApi URL；PAT 与业务数据将经明文链路发送
```

API contract 说明 HTTPS 始终允许；HTTP 默认只限 sandbox 私网，但显式开关 true 时任意环境及
host 都允许。保留 userinfo/query/fragment 拒绝规则和开关未设置时的默认拒绝。

- [ ] **Step 4: 更新架构、接入说明和 AGENTS 规则**

将所有“production/staging 必须 HTTPS”绝对表述替换为“默认必须 HTTPS；部署人员设置
`TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true` 后允许 HTTP”。文档与 `AGENTS.md` 必须明确：

- 开关默认 `false`；
- 仅精确 `true` 生效；
- 允许任意 host/port 的 HTTP；
- 该设置会让 PAT、请求和响应经明文链路传输；
- 不影响日志脱敏、URL userinfo/query/fragment 拒绝和 MCP Client `/mcp` 的 HTTPS 要求。

- [ ] **Step 5: 运行文档测试和格式检查**

Run: `npx vitest run tests/unit/remote-readme.test.ts && git diff --check`

Expected: PASS；文档不再与 runtime config 或 Compose 行为冲突。

- [ ] **Step 6: 提交文档改动**

```bash
git add README.md docs/api-contract.md docs/remote-streamable-http-mcp-architecture.md "tvcmall-webapi mcp开发接入说明文档.md" AGENTS.md tests/unit/remote-readme.test.ts
git commit -m "docs: 说明 HTTP WebApi 显式开关"
```

### Task 4: 全量验证与 stage 配置交接

**Files:**
- Modify only if a failing regression requires a correction in files listed above.

- [ ] **Step 1: 运行完整测试集**

Run: `npm test`

Expected: PASS，所有测试文件通过。

- [ ] **Step 2: 运行类型检查、生产构建与 Compose 验证**

Run: `npm run typecheck && npm run build && bash tests/scripts/docker-compose.test.sh`

Expected: 所有命令退出码为 0。

- [ ] **Step 3: 运行安全和工作区检查**

Run: `git diff --check && git status --short --branch`

Expected: 无格式问题；仅保留用户已有的 `package.json` 和 `query.sh` 改动。

- [ ] **Step 4: 给出 stage.env 配置**

向用户交接以下配置，但不得把真实 PAT 写入任何文件或日志：

```dotenv
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true
TVCMALL_WEBAPI_BASE_URL=http://113.108.60.83:8084/api
```
