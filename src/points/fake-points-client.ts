import type { StoredAuthSession } from '../storage/token-store.js';
import type { ListPointRecordsInput, ListPointRecordsResult, PointRecord, PointsClient, PointsStat } from './points-client.js';

const FIXTURE_POINTS: PointsStat = {
  available_points: 120,
  pending_points: 5,
  total_earned: 300,
  total_used: 175
};

const FIXTURE_POINT_RECORDS: PointRecord[] = [
  { id: 'pt_1', type: 'earn', points: 20, description: 'Order reward', created_at: '2026-07-01T00:00:00Z' },
  { id: 'pt_2', type: 'use', points: -10, description: 'Coupon redemption', created_at: '2026-07-02T00:00:00Z' }
];

export class FakePointsClient implements PointsClient {
  async getPoints(_session: StoredAuthSession): Promise<PointsStat> {
    return { ...FIXTURE_POINTS };
  }

  async listPointRecords(input: ListPointRecordsInput, _session: StoredAuthSession): Promise<ListPointRecordsResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(Math.max(1, input.page_size), 50);
    const records = input.direction === 'all'
      ? FIXTURE_POINT_RECORDS
      : FIXTURE_POINT_RECORDS.filter((item) => item.type === (input.direction === 'got' ? 'earn' : 'use'));
    const start = (page - 1) * pageSize;
    return {
      direction: input.direction,
      page,
      page_size: pageSize,
      total: records.length,
      items: records.slice(start, start + pageSize).map((item) => ({ ...item }))
    };
  }
}
