import { afterEach, describe, expect, it } from 'vitest';
import { createMcpStdioHarness, type McpStdioHarness } from '../../src/harness/mcp-stdio-harness.js';

const harnesses: McpStdioHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

describe('MCP stdio harness', () => {
  it('lists tools and returns auth-required for protected tools without polluting stderr', async () => {
    const harness = await createMcpStdioHarness({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/harness/stdio-server.ts'],
      env: { TVCMALL_WEBAPI_BASE_URL: 'https://webapi.test' }
    });
    harnesses.push(harness);

    await harness.initialize();

    const toolsResponse = await harness.request('tools/list', {});
    const toolNames = toolsResponse.result.tools.map((tool: { name: string }) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'tvcmall_auth_status',
      'tvcmall_search_products',
      'tvcmall_get_points',
      'tvcmall_list_point_records',
      'tvcmall_list_balance_records'
    ]));

    const searchResponse = await harness.request('tools/call', {
      name: 'tvcmall_search_products',
      arguments: { query: 'iphone case', page: 1, page_size: 2 }
    });

    expect(JSON.stringify(searchResponse.result)).toContain('AUTH_REQUIRED: 缺少或无效的 TVCMall MCP PAT');
    expect(await harness.stderr()).toBe('');
  });
});
