/**
 * 서버 전용: Next.js API에서 PartyKit 룸에 session_update 브로드캐스트 요청
 */

const PARTY_NAME = 'game';

function getPartykitBaseUrl(): string {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (!host) return '';
  if (host.startsWith('localhost')) {
    return `http://${host}`;
  }
  return `https://${host}`;
}

export type SessionUpdatePayload = {
  type: 'session_update';
  session: Record<string, unknown>;
};

/**
 * 해당 게임 세션 룸에 session_update 브로드캐스트.
 * PARTYKIT_SECRET, NEXT_PUBLIC_PARTYKIT_HOST 설정 시에만 동작.
 */
export async function broadcastSessionUpdate(
  sessionId: string,
  session: Record<string, unknown>
): Promise<boolean> {
  const baseUrl = getPartykitBaseUrl();
  if (!baseUrl) return false;

  const secret = process.env.PARTYKIT_SECRET;
  const url = `${baseUrl}/parties/${PARTY_NAME}/${sessionId}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        type: 'session_update',
        session,
      } satisfies SessionUpdatePayload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
