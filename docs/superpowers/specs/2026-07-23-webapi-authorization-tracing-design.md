# WebApi Authorization Tracing Design

## Goal

让 MCP 的 tool 错误日志能够安全地定位到下游 WebApi 的具体 method、normalized route、HTTP status 和跨服务 trace ID；当 WebApi 提供受控授权拒绝原因时，日志还要明确区分缺少 scope、route 未登记和 route 已禁用。

## Problem

WebApi 当前把 route 未登记、route 禁用和 PAT 缺少 scope 都返回 HTTP `403`。MCP 只把该状态映射为 `PERMISSION_DENIED`，因此不能仅凭 MCP 当前日志判断 `tvcmall_get_points` 的拒绝原因。

## MCP Design

每次 MCP 调用 WebApi 时：

1. 生成一个 UUID `traceId`，只用于关联日志，不从 PAT、session ID、客户信息或请求参数派生。
2. 向现有 WebApi route 额外发送以下仅用于观测的 header：
   - `X-TVCMall-MCP-Client: tvcmall-mcp-server`
   - `X-TVCMall-MCP-Trace-Id: <uuid>`
3. 只从目标 URL 提取并记录 HTTP method 与 normalized route：小写 path、去掉 query 和首尾 `/`。不得记录完整 URL 或 query。
4. 在 `WebApiRequestError` 中保存安全 metadata：`traceId`、`webApiMethod`、`normalizedRoute`、可选的 `webApiStatus` 和可选的白名单 `authReason`。
5. tool 完成日志在失败时增加这组 metadata；正常 tool 完成日志不包含下游调用细节。

预期日志：

```json
{
  "event": "mcp_tool_completed",
  "toolName": "tvcmall_get_points",
  "outcome": "error",
  "errorCode": "PERMISSION_DENIED",
  "webApiMethod": "GET",
  "normalizedRoute": "api/v3/user/points/stat",
  "webApiStatus": 403,
  "traceId": "7f4b64e0-6f3c-4f8c-a3ac-97e0c99f4941",
  "authReason": "scope_missing"
}
```

## WebApi Contract

WebApi / ApplicationServices 在收到 `X-TVCMall-MCP-Trace-Id` 时必须将它写入其安全审计日志，并与授权决策关联。对于 MCP PAT 的 `403`，WebApi 可返回：

```http
X-TVCMall-MCP-Auth-Reason: scope_missing | route_not_registered | route_disabled
```

MCP 只读取该单一 response header；未知、空白或不符合精确枚举值的值被忽略。该 header 仅表示授权配置类别，不允许携带用户、PAT、scope 列表、数据库信息、异常文本或任意自由文本。

没有这个 header 时，MCP 仍记录 method、normalized route、status 和 trace ID；使用 trace ID 在 WebApi / ApplicationServices 审计日志中查询授权决策。MCP 不读取失败 response body，也不自行判断 PAT scope 或 allowlist。

## Security Boundary

- 不记录或派生 `TVCMALL_API_KEY`、PAT、`Authorization`、session ID、客户标识、请求参数、完整 URL、response body、stack 或 PII。
- trace ID 使用随机 UUID，不得复用 session ID、PAT 指纹或客户端提供的值。
- 请求只发送到已配置的 `TVCMALL_WEBAPI_BASE_URL` 下的现有 route；新 header 不参与授权逻辑。
- `authReason` 仅接受 `scope_missing`、`route_not_registered`、`route_disabled` 三个值。

## Validation

1. WebApi 请求带有静态 MCP client header 和格式正确的随机 trace header，且保留单一 `Bearer <PAT>`。
2. 403 tool 日志包含下游 method、normalized route、HTTP status 和 trace ID，但不包含 PAT、Authorization、query、input 或 raw body。
3. 只有精确白名单 auth reason 会进入日志；未知 header 被丢弃。
4. 网络、超时和 body read failure 仍使用 `API_UNAVAILABLE`，但有可关联的 trace ID、method 和 normalized route。
5. 既有 401 / 403 / 429 / 5xx 映射、stdio stderr 纯净性和 HTTP session/PAT 保护回归通过。
