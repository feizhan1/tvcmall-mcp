import type { ServerResponse } from 'node:http';

export function sendHttpError(res: ServerResponse, status: 400 | 401 | 404 | 429 | 503, code: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code } }));
}
