import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';
import { broadcastSessionUpdate } from '@/lib/partykit';

/**
 * POST /api/game/session/abandon
 * Body: { sessionId: string }
 * 참여 중인 세션을 취소하고 매칭 화면으로 돌아갈 수 있게 함.
 * (새로고침, 상대 이탈 시 사용)
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId: gameSessionId } = await req.json();

    if (!gameSessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const playerSessionId = await getSessionId();
    const supabase = await createClient();

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('session_id', playerSessionId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 400 });
    }

    const { data: session } = await supabase
      .from('game_sessions')
      .select('id, status, player1_id, player2_id')
      .eq('id', gameSessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const isParticipant =
      session.player1_id === player.id || session.player2_id === player.id;
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // 이미 종료/취소된 세션은 그대로 성공 반환
    if (session.status === 'finished' || session.status === 'cancelled') {
      return NextResponse.json({ cancelled: true });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('game_sessions')
      .update({ status: 'cancelled' })
      .eq('id', gameSessionId)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    if (updated) {
      await broadcastSessionUpdate(gameSessionId, updated as Record<string, unknown>);
    }
    return NextResponse.json({ cancelled: true });
  } catch (err) {
    console.error('POST /api/game/session/abandon error:', err);
    return NextResponse.json(
      { error: 'Failed to abandon session' },
      { status: 500 }
    );
  }
}
