import type * as Party from 'partykit/server';

const SESSION_UPDATE_TYPE = 'session_update';
const SESSION_END_TYPE = 'session_end';
const PLAYER_LEFT_TYPE = 'player_left';

type JoinPayload = { type: 'join'; playerId: string };

function getSecret(env: Record<string, unknown>): string {
  return (env.PARTYKIT_SECRET as string) || '';
}

function verifySecret(req: Party.Request, env: Record<string, unknown>): boolean {
  const secret = getSecret(env);
  if (!secret) return true; // 개발 시 검증 생략 가능
  const auth = req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export default class GameServer implements Party.Server {
  /** 게임 종료 여부: true면 새 연결 거부, player_left 브로드캐스트 생략 */
  private ended = false;

  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (!verifySecret(req, this.room.env)) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      const body = await req.json<{ type: string; session?: unknown }>();

      if (body.type === SESSION_UPDATE_TYPE && body.session != null) {
        this.room.broadcast(JSON.stringify(body));
        return new Response('OK', { status: 200 });
      }

      if (body.type === SESSION_END_TYPE) {
        this.ended = true;
        // 클라이언트에 최종 세션 상태 전달 → 클라이언트가 소켓을 닫음
        this.room.broadcast(
          JSON.stringify({ type: SESSION_END_TYPE, session: body.session })
        );
        return new Response('OK', { status: 200 });
      }

      return new Response('Bad request', { status: 400 });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  }

  onConnect(connection: Party.Connection<{ playerId?: string }>): void {
    // 이미 종료된 룸이면 즉시 연결 끊기
    if (this.ended) {
      connection.close(1000, 'Game already ended');
      return;
    }
  }

  onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Party.Connection<{ playerId?: string }>
  ): void {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text) as JoinPayload;
      if (data.type === 'join' && typeof data.playerId === 'string') {
        sender.setState({ playerId: data.playerId });
      }
    } catch {
      // ignore invalid messages
    }
  }

  onClose(connection: Party.Connection<{ playerId?: string }>): void {
    // 게임이 이미 종료되었으면 player_left 브로드캐스트 생략
    if (this.ended) return;

    const state = connection.state;
    const playerId = state?.playerId;
    if (playerId) {
      this.room.broadcast(
        JSON.stringify({ type: PLAYER_LEFT_TYPE, playerId }),
        [connection.id]
      );
    }
  }
}
