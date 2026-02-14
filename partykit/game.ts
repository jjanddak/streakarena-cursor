import type * as Party from 'partykit/server';

const SESSION_UPDATE_TYPE = 'session_update';
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
      return new Response('Bad request', { status: 400 });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  }

  onConnect(connection: Party.Connection<{ playerId?: string }>): void {
    // 클라이언트가 join 시 playerId 전송하면 state에 저장 (onMessage에서 처리)
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
