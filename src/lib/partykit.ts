/**
 * 서버 전용: Next.js API에서 PartyKit 룸에 브로드캐스트 요청
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

export type SessionEndPayload = {
  type: 'session_end';
  session: Record<string, unknown>;
};

async function postToPartyKit(
  sessionId: string,
  payload: SessionUpdatePayload | SessionEndPayload
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
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 해당 게임 세션 룸에 session_update 브로드캐스트.
 * 게임 진행 중 중간 업데이트에 사용 (예: 한 명만 선택 완료 시).
 */
export async function broadcastSessionUpdate(
  sessionId: string,
  session: Record<string, unknown>
): Promise<boolean> {
  return postToPartyKit(sessionId, {
    type: 'session_update',
    session,
  } satisfies SessionUpdatePayload);
}

/**
 * 해당 게임 세션 룸에 session_end 브로드캐스트.
 * 게임 종료 시 사용 (승/패/무승부).
 * 클라이언트는 이 메시지를 받으면 소켓을 닫고 결과 화면을 표시.
 * 서버는 이후 새 연결을 거부하고, player_left 브로드캐스트를 생략.
 */
export async function broadcastSessionEnd(
  sessionId: string,
  session: Record<string, unknown>
): Promise<boolean> {
  return postToPartyKit(sessionId, {
    type: 'session_end',
    session,
  } satisfies SessionEndPayload);
}
