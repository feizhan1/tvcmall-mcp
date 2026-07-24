# 显式允许 HTTP WebApi 设计

## 背景

stage WebApi 当前可通过 `http://113.108.60.83:8084/api` 访问。现有 runtime config
仅允许 `sandbox` 使用 loopback 或 RFC1918 私网 HTTP，因此 `compose.staging.yaml`
固定的 `TVCMALL_API_ENV=staging` 会在服务启动前拒绝该地址。

本次需求是允许 `production`、`staging` 和 `sandbox` 均可连接任意 HTTP WebApi host 与
port，包括公网 IP。该行为必须由部署配置显式启用，而不能随着环境名自动发生。

## 决策

新增严格布尔运行时配置 `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP`：

```dotenv
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true
TVCMALL_WEBAPI_BASE_URL=http://113.108.60.83:8084/api
```

只有精确字符串 `true` 才启用。未设置、空白、`false` 或其他任意值均为关闭状态。

当开关关闭时，保留现有规则：HTTPS 始终允许；`sandbox` 仅可使用 loopback/RFC1918
HTTP；`production` 与 `staging` 拒绝 HTTP。当开关开启时，任意环境均可使用 HTTP，且不再
对 hostname、IP 段或端口设置限制。

所有环境继续拒绝 base URL 中的 userinfo、query 和 fragment。PAT、API KEY、Authorization
和 PII 的日志脱敏规则不变；允许 HTTP 只改变下游 URL 的传输协议校验。

## 运行时与部署契约

`TvcMallRuntimeConfig` 新增 `allowInsecureWebApiHttp: boolean`，默认 `false`。
`loadRuntimeConfig` 读取该变量并将值传给 `readWebApiBaseUrl`。

`compose.staging.yaml` 与 `compose.production.yaml` 向容器透传：

```yaml
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP: ${TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP:-false}
```

因此部署人员只需在对应 `stage.env` 或 production env 中设置显式开关；两个 compose
文件仍分别固定 `TVCMALL_API_ENV=staging` 和 `production`。

推荐的 stage 配置为：

```dotenv
TVCMALL_MCP_IMAGE=crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-mcp:<tag>
TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true
TVCMALL_WEBAPI_BASE_URL=http://113.108.60.83:8084/api
```

## 行为与错误处理

- 配置 HTTPS：不受开关影响。
- 配置 sandbox 私网 HTTP：不受开关影响，维持现有可用性。
- 配置 production/staging 公网或私网 HTTP：仅开关为 `true` 时允许。
- 配置 sandbox 公网 HTTP：仅开关为 `true` 时允许。
- 关闭开关时的报错改为提示设置
  `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true`，不回显原始 URL。
- 运行时不会记录该开关值之外的 base URL host、PAT 或 Authorization。

## 测试与文档

单元测试覆盖 production、staging 与 sandbox 的公网 HTTP：开关开启时接受、关闭时拒绝；
同时覆盖精确布尔解析、HTTPS 不受影响、userinfo/query/fragment 仍拒绝。Compose 测试断言
staging 与 production 都向容器传递默认 `false` 和 env 覆盖值。

README、`docs/api-contract.md`、WebApi 接入说明及 `AGENTS.md` 更新为新的显式开关契约，
并明确启用后 PAT 和业务数据会通过明文链路发送，部署人员自行承担该风险。
