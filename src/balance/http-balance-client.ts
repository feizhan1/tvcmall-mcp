import {
  BaseHttpClient,
  firstArray,
  firstObject,
  readInteger,
  readNumber,
  readString,
  unwrapPayload,
  type HttpClientOptions,
  type JsonObject
} from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type {
  BalanceClient,
  BalanceDirectionFilter,
  BalanceRecord,
  BalanceRecordDirection,
  ListBalanceRecordsInput,
  ListBalanceRecordsResult
} from './balance-client.js';

const POINTS_TYPE_BY_DIRECTION: Record<BalanceDirectionFilter, string> = {
  all: '0',
  income: '1',
  expense: '2'
};

export class HttpBalanceClient extends BaseHttpClient implements BalanceClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async listBalanceRecords(input: ListBalanceRecordsInput, session: StoredAuthSession): Promise<ListBalanceRecordsResult> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/balance/list', {
      pageindex: String(input.page),
      pagesize: String(input.page_size),
      pointstype: POINTS_TYPE_BY_DIRECTION[input.direction]
    }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall balance records'));
    const model = firstObject(payload, ['model']) ?? payload;
    const items = firstArray(model, ['Balance', 'items', 'list', 'records']).map(mapBalanceRecord);

    return {
      ...input,
      total: readInteger(model, ['Total', 'total', 'totalCount', 'count'], items.length),
      items
    };
  }
}

function mapBalanceRecord(source: JsonObject): BalanceRecord {
  return {
    id: readString(source, ['ID', 'id', 'recordId']),
    amount: readNumber(source, ['Value', 'amount']),
    formatted_amount: readString(source, ['ValueFormat', 'formattedAmount']),
    direction: mapRecordDirection(readInteger(source, ['PointsType', 'pointsType'])),
    type: readString(source, ['Type', 'type']),
    description: readString(source, ['Message', 'description']),
    order_id: readString(source, ['OrderID', 'orderId']),
    display_date: readString(source, ['CreateTime', 'displayDate']),
    created_at: readString(source, ['StayDate', 'createdAt'])
  };
}

function mapRecordDirection(pointsType: number): BalanceRecordDirection {
  if (pointsType === 1) return 'income';
  if (pointsType === 2) return 'expense';
  return 'unknown';
}
