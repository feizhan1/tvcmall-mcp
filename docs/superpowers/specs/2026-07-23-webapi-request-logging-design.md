# WebApi 全量请求日志设计

## 目标

让远程 MCP Server 对每一次经 `BaseHttpClient` 发出的 WebApi 业务请求输出一条安全、可关联的 JSON 日志。日志覆盖成功、HTTP 拒绝、网络、超时和响应解析失败，以便仅凭 MCP 容器日志先确定请求在哪个阶段失败。

## 范围与边界

- 覆盖远程 MCP 的商品、订单、物流、运费、积分和余额等业务 WebApi client；它们均继承 `BaseHttpClient`。
- 每个下游请求只写一条 `mcp_webapi_request_completed` 事件。批量 tool 发出多次请求时，每次请求各有独立事件和 trace ID。
- 内部 stdio harness 没有 HTTP logger，保持 stdout 纯 MCP JSON-RPC、stderr 无普通应用日志。
- legacy `HttpAuthClient` 不属于远程 MCP 的 PAT 业务调用链，不纳入本次范围。
- 绝不记录 PAT、`TVCMALL_API_KEY`、`Authorization`、header 原文、完整 URL/query、请求/响应 body、session ID、堆栈或 PII。

## 事件契约

所有事件共享以下字段：

```json
{
  "event": "mcp_webapi_request_completed",
  "outcome": "success | error",
  "traceId": "uuid",
  "webApiMethod": "GET | POST",
  "normalizedRoute": "api/v3/user/points/stat",
  "webApiDurationMs": 42
}
```

HTTP 响应会额外记录 `webApiStatus`。错误请求记录稳定 `errorCode` 和 `webApiFailurePhase`：

| `webApiFailurePhase` | 含义 |
| --- | --- |
| `http_response` | 已收到非 2xx HTTP 响应 |
| `network` | 下游连接、DNS、TLS 或其他 fetch 网络失败 |
| `timeout` | MCP 设置的 WebApi deadline 到期 |
| `caller_cancelled` | 调用方 AbortSignal 取消请求 |
| `response_body` | 成功状态的 JSON body 无法读取 |
| `invalid_json` | 成功状态返回的 JSON 不是对象 |

对 HTTP `403`，额外记录 `authReasonState`：

| 值 | 含义 |
| --- | --- |
| `accepted` | WebApi 返回白名单 `authReason`，同时记录该值 |
| `missing` | WebApi 未返回 `X-TVCMall-MCP-Auth-Reason` |
| `unrecognized` | WebApi 返回了 header，但值不在白名单；原值不记录 |

对于其他状态不记录 `authReasonState`。日志等级为：成功 `info`，4xx `warn`，5xx、网络、超时、body/JSON 读取失败 `error`。

## 数据流

1. `BaseHttpClient` 在发起 fetch 前生成 trace metadata 和开始时间，并继续注入既有观测 header。
2. fetch 失败时立即发出一次错误事件；获得 response 后将 metadata 保存在 `WeakMap`，直到 `readJson` 结束。
3. `readJson` 根据响应状态或 JSON 结果产生成功/错误事件，并将同一受控 metadata 放入 `WebApiRequestError`，供既有 tool 完成日志复用。
4. `createTvcMallClients` 仅在远程 HTTP server 提供 logger 时，将 `McpHttpLogger.webApiRequestCompleted` 注入真实 HTTP client；fake client 与 stdio 不输出该事件。

## 验证

- 单元测试断言成功、403 白名单、403 缺失 header、403 未知 header、网络、超时、body read 和 invalid JSON 各输出恰好一条事件。
- 对每种事件断言不含 PAT、`Authorization`、查询参数、上游 body 或未知 header 原文。
- logger JSON 测试断言 info/warn/error 分级与安全字段。
- Streamable HTTP 和 stdio 回归验证 HTTP 服务会输出下游日志，而 stdio stderr 仍为空。
