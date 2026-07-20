export const MCP_ERROR_MESSAGES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED: 缺少或无效的 TVCMall MCP PAT',
  TOKEN_EXPIRED: 'token 已过期，自动 refresh 失败',
  PERMISSION_DENIED: 'PERMISSION_DENIED: 当前 PAT 没有该权限',
  RATE_LIMITED: 'RATE_LIMITED: 请求过快，请稍后再试',
  VALIDATION_ERROR: '参数格式错误',
  API_UNAVAILABLE: 'API_UNAVAILABLE: TVCMall 服务暂不可用'
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_MESSAGES;
