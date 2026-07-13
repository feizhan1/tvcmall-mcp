import { describe, expect, it, vi } from 'vitest';
import { getPointsForMcp, listPointRecordsForMcp } from '../../src/tools/points.js';
import { FakePointsClient } from '../../src/points/fake-points-client.js';

const authContext = {
  customerId: 'customer_123', displayName: 'TVCMall Buyer', scopes: ['points:read'],
  upstreamAccessToken: 'short-lived-token', expiresAt: '2030-01-01T00:00:00.000Z', apiKeyFingerprint: 'fingerprint'
};

describe('points MCP tools', () => {
  it('returns API Key auth required when request auth context is missing', async () => {
    const result = await getPointsForMcp({}, { pointsClient: new FakePointsClient() });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('AUTH_REQUIRED');
  });

  it('returns customer points and records without short-lived token values', async () => {
    const pointsClient = new FakePointsClient();
    const points = await getPointsForMcp({}, { authContext, pointsClient });
    const records = await listPointRecordsForMcp({ page: 1, page_size: 10 }, { authContext, pointsClient });

    expect(points.structuredContent).toEqual({ available_points: 120, pending_points: 5, total_earned: 300, total_used: 175 });
    expect(records.structuredContent).toMatchObject({ page: 1, page_size: 10, total: 2, items: expect.any(Array) });
    expect(JSON.stringify([points, records])).not.toContain('short-lived-token');
  });

  it('does not call points client when points:read is absent', async () => {
    const pointsClient = new FakePointsClient();
    const getPoints = vi.spyOn(pointsClient, 'getPoints');
    const result = await getPointsForMcp({}, { authContext: { ...authContext, scopes: [] }, pointsClient });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('PERMISSION_DENIED');
    expect(getPoints).not.toHaveBeenCalled();
  });
});
