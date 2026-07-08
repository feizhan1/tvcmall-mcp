import type { StoredAuthSession } from '../storage/token-store.js';

export interface PointsStat {
  available_points: number;
  pending_points: number;
  total_earned: number;
  total_used: number;
}

export interface ListPointRecordsInput {
  page: number;
  page_size: number;
}

export interface PointRecord {
  id: string;
  type: string;
  points: number;
  description: string;
  created_at: string;
}

export interface ListPointRecordsResult {
  page: number;
  page_size: number;
  total: number;
  items: PointRecord[];
}

export interface PointsClient {
  getPoints(session: StoredAuthSession): Promise<PointsStat>;
  listPointRecords(input: ListPointRecordsInput, session: StoredAuthSession): Promise<ListPointRecordsResult>;
}
