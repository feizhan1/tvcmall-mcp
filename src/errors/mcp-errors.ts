export const MCP_ERROR_MESSAGES = {
  AUTH_REQUIRED: '未登录，请先运行 npx @tvcmall/mcp login',
  TOKEN_EXPIRED: 'token 已过期，自动 refresh 失败',
  PERMISSION_DENIED: '当前账号没有该权限',
  RATE_LIMITED: '请求过快，请稍后再试',
  VALIDATION_ERROR: '参数格式错误',
  API_UNAVAILABLE: 'TVCMall 服务暂不可用',
  EXPORT_TOO_LARGE: '导出范围过大，请缩小时间范围'
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_MESSAGES;
