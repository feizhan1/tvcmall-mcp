import { BaseHttpClient, firstArray, readInteger, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ListPointRecordsInput, ListPointRecordsResult, PointRecord, PointsClient, PointsStat } from './points-client.js';

export class HttpPointsClient extends BaseHttpClient implements PointsClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async getPoints(session: StoredAuthSession): Promise<PointsStat> {
    const response = await this.fetchImpl(this.createUrl('/m/user/points/stat'), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall points stat'));

    return {
      available_points: readInteger(payload, ['available_points', 'availablePoints', 'available', 'points']),
      pending_points: readInteger(payload, ['pending_points', 'pendingPoints', 'pending']),
      total_earned: readInteger(payload, ['total_earned', 'totalEarned', 'earned']),
      total_used: readInteger(payload, ['total_used', 'totalUsed', 'used'])
    };
  }

  async listPointRecords(input: ListPointRecordsInput, session: StoredAuthSession): Promise<ListPointRecordsResult> {
    const response = await this.fetchImpl(this.createUrl('/v3/user/points/list', {
      pageindex: String(input.page),
      pagesize: String(input.page_size)
    }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall points records'));
    const items = firstArray(payload, ['items', 'list', 'records']).map(mapPointRecord);

    return {
      page: input.page,
      page_size: input.page_size,
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
    description: readString(source, ['description', 'desc', 'remark', 'title']),
    created_at: readString(source, ['created_at', 'createdAt', 'createTime', 'time'])
  };
}
