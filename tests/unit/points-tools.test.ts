import { describe, expect, it, vi } from 'vitest';
import { createPatAuthContext } from '../../src/auth/request-auth-context.js';
import { getPointsForMcp, ListPointRecordsInputSchema, listPointRecordsForMcp } from '../../src/tools/points.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';

const pat = 'tmcp_v1_token-id.secret-value';
const authContext = createPatAuthContext(pat);

describe('points MCP tools', () => {
  it('returns PAT auth required when request auth context is missing', async () => {
    const result = await getPointsForMcp({}, { pointsClient: new FakePointsClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns customer points and records without PAT values', async () => {
    const pointsClient = new FakePointsClient();
    const points = await getPointsForMcp({}, { authContext, pointsClient });
    const records = await listPointRecordsForMcp({ page: 1, page_size: 10 }, { authContext, pointsClient });

    expect(points.structuredContent).toEqual({ available_points: 120, pending_points: 5, total_earned: 300, total_used: 175 });
    expect(records.structuredContent).toMatchObject({ page: 1, page_size: 10, total: 2, items: expect.any(Array) });
    expect(JSON.stringify([points, records])).not.toContain(pat);
  });

  it('defaults direction to all, rejects invalid values, and filters fake records', async () => {
    const pointsClient = new FakePointsClient();
    const listPointRecords = vi.spyOn(pointsClient, 'listPointRecords');

    const all = await listPointRecordsForMcp({ page: 1, page_size: 20 }, { authContext, pointsClient });
    const got = await listPointRecordsForMcp({ page: 1, page_size: 20, direction: 'got' }, { authContext, pointsClient });
    const used = await listPointRecordsForMcp({ page: 1, page_size: 20, direction: 'used' }, { authContext, pointsClient });

    expect(listPointRecords).toHaveBeenNthCalledWith(1, expect.objectContaining({ direction: 'all' }), expect.anything());
    expect(all.structuredContent).toMatchObject({ direction: 'all', total: 2 });
    expect(got.structuredContent).toMatchObject({ direction: 'got', total: 1, items: [expect.objectContaining({ type: 'earn' })] });
    expect(used.structuredContent).toMatchObject({ direction: 'used', total: 1, items: [expect.objectContaining({ type: 'use' })] });
    expect(() => ListPointRecordsInputSchema.parse({ page: 1, page_size: 20, direction: 'income' })).toThrow();
  });

  it('calls the points client without a local scope list', async () => {
    const pointsClient = new FakePointsClient();
    const getPoints = vi.spyOn(pointsClient, 'getPoints');
    const result = await getPointsForMcp({}, { authContext, pointsClient });

    expect(result.isError).toBeUndefined();
    expect(getPoints).toHaveBeenCalledWith(expect.objectContaining({ accessToken: pat, scopes: [] }));
  });
});
