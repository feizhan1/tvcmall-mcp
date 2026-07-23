# WebApi 详细诊断日志设计

## 1. 背景与目标

当前远程 MCP 服务会为每次 MCP -> WebApi 请求输出一条
`mcp_webapi_request_completed`，但只记录 method、normalized route、status、耗时、
trace ID、稳定错误码和失败阶段。非 2xx 响应正文会被主动取消；当 WebApi 返回
`403` 且没有 `X-TVCMall-MCP-Auth-Reason` 时，日志只能显示
`authReasonState=missing`，无法进一步判断下游返回了什么错误。

本次改动的目标是：默认对每一次真实 WebApi 请求输出一条足以排查请求和响应内容的
结构化完成日志，包括经过强制脱敏和大小限制的 query、headers、request body 与
response body。只有显式日志级别过滤或 `TVCMALL_LOG_LEVEL=silent` 才不输出对应事件。

详细日志不得改变 WebApi 请求、业务响应解析、tool 输出或现有错误映射。

## 2. 方案比较与决策

### 方案 A：保留当前受控字段

安全和日志体积最可控，但 WebApi 没有返回授权原因 header 时无法定位 `403`，不满足
排障目标。

### 方案 B：结构化完整日志、强制脱敏和大小限制（采用）

记录请求与响应的诊断快照，敏感字段不可配置地脱敏，正文超过上限后截断。该方案在
排障能力、日志成本和安全边界之间取得平衡。

### 方案 C：原样记录 HTTP 流量

实现简单，但会把 PAT、API KEY、Cookie、密码或客户 PII 写入 Docker 日志，违反项目
安全边界，也无法保证日志销毁前未被采集或复制，因此不采用。

## 3. 日志契约

每个 WebApi 请求仍只输出一条 `mcp_webapi_request_completed`，避免开始和完成事件重复
占用日志。事件保留现有字段：

- `traceId`
- `webApiMethod`
- `normalizedRoute`
- `webApiStatus`
- `webApiDurationMs`
- `outcome`
- `errorCode`
- `webApiFailurePhase`
- `authReasonState`
- `authReason`

事件新增以下结构化字段：

- `webApiRequestQuery`：query 参数对象；重复参数使用数组。
- `webApiRequestHeaders`：出站 header 对象，敏感值脱敏。
- `webApiRequestBody`：支持的出站正文经过脱敏后的快照。
- `webApiRequestBodyBytes`：可确定时的原始正文字节数。
- `webApiRequestBodyTruncated`：日志快照是否因大小上限截断。
- `webApiResponseHeaders`：响应 header 对象，敏感值脱敏。
- `webApiResponseBody`：响应正文经过脱敏后的快照。
- `webApiResponseBodyBytes`：已读取响应正文的 UTF-8 字节数。
- `webApiResponseBodyTruncated`：日志快照是否因大小上限截断。
- `webApiResponseBodyState`：`complete`、`empty`、`read_failed` 或
  `unavailable`。

不记录 scheme、host、userinfo 或 fragment。URL 仍使用 `normalizedRoute` 加结构化 query
表达，避免完整 URL 把配置或凭证混入日志。

`mcp_tool_completed` 继续保持摘要定位用途，不复制请求和响应正文；运维人员使用相同
`traceId` 关联详细的 `mcp_webapi_request_completed`。

## 4. 脱敏与截断

新增面向结构化日志的递归脱敏函数，先脱敏、后序列化、最后截断。任何日志级别和运行
环境都不能关闭脱敏。

必须脱敏的 header 包括但不限于：

- `Authorization`、`Proxy-Authorization`
- `TVCMALL_API_KEY`
- `Cookie`、`Set-Cookie`
- 名称包含 `token`、`secret`、`password`、`credential` 或 `api-key` 的 header

必须脱敏的对象字段包括但不限于：

- token、secret、password、authorization、cookie、api key
- phone、mobile、telephone、email
- address、address line、street、recipient 及明确表示客户姓名的字段

字符串还要继续匹配并遮盖 Bearer 值、`tmcp_v1_` PAT、邮箱和电话号码。脱敏后的值统一
使用 `[REDACTED]` 或现有等价占位符。字段名保留，以便判断 WebApi 是否收到了预期数据。

单个 request body 或 response body 的日志快照默认最多 16 KiB UTF-8 内容。超过上限时
只记录安全截断后的前缀，并设置 `*Truncated=true`；字节数字段记录截断前正文大小。
截断不得切开 UTF-8 字符，也不得发生在脱敏之前。

JSON 正文按对象递归脱敏；非 JSON 文本先执行自由文本脱敏。当前项目未使用且无法安全
展开的二进制、stream、FormData 等 body，只记录类型和可确定的字节数，不读取原值。

## 5. 请求与响应数据流

`BaseHttpClient` 在调用 fetch 前生成安全的请求诊断快照，并把它保存在当前请求的 tracked
metadata 中。实际发送的 headers 和 body 不受日志快照影响。

收到响应后统一读取正文一次：

- 2xx：从同一份正文解析 JSON，保持当前“必须是 JSON object”的业务约束，同时生成
  脱敏日志快照。
- 非 2xx：读取正文并生成脱敏日志快照，然后仍按 HTTP status 映射稳定错误码。
- 非 2xx 正文读取失败：记录 `webApiResponseBodyState=read_failed`，但仍以已经收到的 HTTP
  status 映射错误，不能把 `403` 改成 `API_UNAVAILABLE`。
- fetch 在收到响应前失败：记录请求快照，响应状态为 `unavailable`，并保留 network、
  timeout 或 caller-cancelled 阶段。

日志 callback 自身抛错不得影响 tool 调用；logger 必须以不抛出为边界，必要时降级为
不含 payload 的现有完成事件。

## 6. 日志等级与配置

沿用现有 `TVCMALL_LOG_LEVEL`：

- 默认 `info`：输出成功及失败的每次 WebApi 请求。
- `warn` / `error`：按现有等级语义显式过滤低等级事件。
- `silent`：完全关闭普通日志。
- `debug`：包含默认详细请求日志和既有 session 生命周期事件。

正文日志默认启用，不新增可输出原始凭证或关闭脱敏的配置。正文快照上限先采用固定
16 KiB，避免增加当前排障不需要的运行时配置面。

## 7. 错误与兼容性

- `401`、`403`、`429`、`5xx` 的稳定错误码映射保持不变。
- 网络、超时、caller cancellation、成功响应正文读取失败和非法 JSON 的失败阶段保持
  可区分。
- 非 2xx 的错误正文仅用于日志诊断，不进入 MCP tool 输出。
- stdio harness 继续使用 no-op logger，stdout/stderr 协议纯净性不变。
- logger 输出仍是一行一个 JSON 对象，便于 `docker logs` 和日志采集器解析。

## 8. 测试与验收

单元测试至少覆盖：

1. 成功 GET 的 query、request headers、response headers 和 response body 被记录。
2. POST request body 被记录，JSON 对象可递归脱敏。
3. `403` 无授权原因 header 时，仍记录脱敏后的 WebApi 错误正文。
4. `403` 错误正文读取失败时仍映射 `PERMISSION_DENIED`。
5. PAT、`TVCMALL_API_KEY`、`Authorization`、Cookie、密码、电话、邮箱和地址不出现在日志。
6. JSON、纯文本、空正文、非法 JSON 和超大正文的 state、字节数及截断标志正确。
7. 网络、超时和 caller cancellation 包含完整请求快照且不伪造响应内容。
8. 每次 WebApi 请求恰好一条 `mcp_webapi_request_completed`。
9. `mcp_tool_completed` 保持摘要字段，不复制正文。
10. stdio harness 不产生普通诊断日志。

完成实现后运行 `npm test`、`npm run typecheck`、`npm run build` 和 `git diff --check`。
