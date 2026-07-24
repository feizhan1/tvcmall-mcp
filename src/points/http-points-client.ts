import { BaseHttpClient, firstArray, firstObject, readInteger, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ListPointRecordsInput, ListPointRecordsResult, PointRecord, PointRecordsDirection, PointsClient, PointsStat } from './points-client.js';

const POINTS_TYPE_BY_DIRECTION: Record<PointRecordsDirection, string> = {
  all: '0',
  got: '1',
  used: '2'
};

export class HttpPointsClient extends BaseHttpClient implements PointsClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async getPoints(session: StoredAuthSession): Promise<PointsStat> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/points/stat'), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall points stat'));
    const model = firstObject(payload, ['model']) ?? payload;
    const account = firstObject(model, ['account']);
    const accountPoints = (account ? firstObject(account, ['points']) : undefined) ?? model;

    return {
      available_points: readInteger(accountPoints, ['available_points', 'availablePoints', 'available', 'balance', 'points']),
      pending_points: readInteger(accountPoints, ['pending_points', 'pendingPoints', 'pending']),
      total_earned: readInteger(accountPoints, ['total_earned', 'totalEarned', 'earned']),
      total_used: readInteger(accountPoints, ['total_used', 'totalUsed', 'used'])
    };
  }

  async listPointRecords(input: ListPointRecordsInput, session: StoredAuthSession): Promise<ListPointRecordsResult> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/points/list', {
      pageindex: String(input.page),
      pagesize: String(input.page_size),
      pointstype: POINTS_TYPE_BY_DIRECTION[input.direction]
    }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall points records'));
    const items = firstArray(payload, ['items', 'list', 'records', 'points']).map(mapPointRecord);

    return {
      ...input,
      total: readInteger(payload, ['total', 'totalCount', 'count'], items.length),
      items
    };
  }
}

function mapPointRecord(source: JsonObject): PointRecord {
  return {
    id: readString(source, ['id', 'recordId', 'record_id']),
    type: readString(source, ['type', 'pointsType', 'action']),
    points: readInteger(source, ['points', 'point', 'value']),
    description: readString(source, ['description', 'desc', 'remark', 'message', 'title']),
    created_at: readString(source, ['created_at', 'createdAt', 'createTime', 'time'])
  };
}
