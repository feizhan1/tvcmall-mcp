# MCP HTTP Request Logging Design

## Goal

让远程 Streamable HTTP MCP 服务默认输出可用于排查的安全日志；只有明确设置 `TVCMALL_LOG_LEVEL=silent` 时才不输出日志。

## Scope

- `npm run dev:local` 启动后，在 stderr 输出服务启动和远程 MCP HTTP 请求结果。
- `info`（默认）记录服务已监听、每个 MCP 请求完成后的 method、HTTP status、JSON-RPC method、请求类别和耗时，以及已执行 tool 的受控名称、结果和耗时。
- `debug` 在 `info` 基础上记录 session 创建、关闭和 idle TTL 清理等生命周期事件。
- `warn` 记录客户端错误和稳定错误码；`error` 记录服务端错误；`silent` 不写普通日志。
- 日志使用一行一个 JSON 对象，便于终端查看和日志采集。

## Security Boundary

日志字段使用白名单，不序列化 request header、request body、WebApi response body 或 error stack。日志不得包含：

- `TVCMALL_API_KEY`、PAT、`Authorization` 或其片段；
- MCP tool 参数、完整 URL、WebApi 原始响应或 session ID；
- 完整地址、电话、邮箱等 PII。

只允许输出事件名、HTTP method/status、JSON-RPC method、预定义的 tool 名称、请求类别、稳定错误码、耗时和配置的监听 host/port/path。

## Architecture

新增独立的 logger 模块，负责日志等级过滤、JSON 序列化和 stderr 输出。`src/index.ts` 根据 `loadRuntimeConfig()` 创建 logger，并将其传给 HTTP server 和 tool 注册层。HTTP server 在请求结束后产生一条汇总日志；它从已解析的 JSON-RPC body 中只提取 `method`，不读取 `params`，并在安全错误响应中记录稳定错误码。每个已执行 tool 额外输出一条完成日志，只包含其代码中预定义的名称、成功/失败结果、稳定错误码和耗时。

内部 stdio harness 继续使用既有 `createTvcMallMcpServer()`，不创建 HTTP logger，因此 stdout 保持纯 MCP JSON-RPC，stderr 也不新增普通请求日志。

## Validation

自动化测试覆盖：

1. 默认 `info` 会输出启动、成功 MCP 请求汇总和已执行 tool 的完成日志。
2. `silent` 不输出日志。
3. 日志不含 API key、PAT、Authorization、tool 参数或 session ID。
4. 失败请求输出稳定错误码而不是原始错误或敏感输入。
5. 现有 stdio 集成测试仍确认 stderr 为空。
