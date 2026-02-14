import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/game/session', () => {
  it('sessionId 없으면 400 반환', async () => {
    const url = 'https://localhost/api/game/session';
    const nextReq = { nextUrl: new URL(url) } as Parameters<typeof GET>[0];
    const res = await GET(nextReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('sessionId required');
  });

  it('sessionId가 빈 문자열이어도 400 반환', async () => {
    const url = 'https://localhost/api/game/session?sessionId=';
    const nextReq = { nextUrl: new URL(url) } as Parameters<typeof GET>[0];
    const res = await GET(nextReq);
    expect(res.status).toBe(400);
  });
});
