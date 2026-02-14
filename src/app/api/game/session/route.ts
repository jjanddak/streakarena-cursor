import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/game/session?sessionId=xxx
 * 참여 중인 세션의 최신 상태를 반환. (폴링용)
 * waiting → playing 전환 보장 (폴링).
 */
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
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
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const isParticipant =
      session.player1_id === player.id || session.player2_id === player.id;
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    return NextResponse.json({ session });
  } catch (err) {
    console.error('GET /api/game/session error:', err);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}
