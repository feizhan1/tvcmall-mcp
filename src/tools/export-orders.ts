import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthClient } from '../auth/auth-client.js';
import { getActiveSession } from '../auth/session-manager.js';
import { exportOrdersToCsv } from '../export/csv-exporter.js';
import { MCP_ERROR_MESSAGES } from '../errors/mcp-errors.js';
import { FakeOrderClient } from '../orders/fake-order-client.js';
import type { OrderClient } from '../orders/order-client.js';
import { OrderStatusSchema } from './orders.js';
import type { TokenStore } from '../storage/token-store.js';

export const ExportOrdersInputSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  status: OrderStatusSchema.optional(),
  format: z.enum(['csv', 'xlsx']).default('csv')
});

export const ExportOrdersOutputSchema = z.object({
  file_path: z.string(),
  order_count: z.number().int(),
  format: z.enum(['csv', 'xlsx']),
  date_range: z.object({
    start_date: z.string(),
    end_date: z.string()
  })
});

export type ExportOrdersInput = z.infer<typeof ExportOrdersInputSchema>;

export interface ExportOrdersDependencies {
  tokenStore: TokenStore;
  authClient?: AuthClient;
  orderClient?: OrderClient;
  exportDir?: string;
  now?: () => Date;
}

export async function exportOrdersForMcp(
  input: ExportOrdersInput,
  dependencies: ExportOrdersDependencies
): Promise<CallToolResult> {
  const session = await getActiveSession(dependencies.tokenStore, {
    authClient: dependencies.authClient,
    now: dependencies.now
  });

  if (!session) {
    return { isError: true, content: [{ type: 'text', text: MCP_ERROR_MESSAGES.AUTH_REQUIRED }] };
  }

  const parsedInput = ExportOrdersInputSchema.parse(input);

  if (parsedInput.format === 'xlsx') {
    return {
      isError: true,
      content: [{ type: 'text', text: 'EXPORT_FORMAT_UNSUPPORTED: xlsx 导出尚未实现，请先使用 csv。' }]
    };
  }

  const orderClient = dependencies.orderClient ?? new FakeOrderClient();
  const orders = await orderClient.listOrders(
    {
      start_date: parsedInput.start_date,
      end_date: parsedInput.end_date,
      status: parsedInput.status,
      page: 1,
      page_size: 50
    },
    session
  );
  const exportResult = await exportOrdersToCsv(orders.items, {
    exportDir: dependencies.exportDir,
    now: dependencies.now
  });
  const structured = {
    file_path: exportResult.file_path,
    order_count: orders.items.length,
    format: parsedInput.format,
    date_range: {
      start_date: parsedInput.start_date,
      end_date: parsedInput.end_date
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: `已导出 ${structured.order_count} 个订单到 ${structured.file_path}`
      }
    ],
    structuredContent: structured
  };
}
