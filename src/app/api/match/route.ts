import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';

/**
 * POST /api/match
 * Body: { gameSlug: string }
 *
 * 매칭 플로우:
 * 1. 이 플레이어의 기존 waiting/playing 세션을 모두 cancelled 처리 (깨끗한 상태)
 * 2. 다른 플레이어가 만든 waiting 세션이 있으면 합류
 * 3. 없으면 새 waiting 세션 생성
 */
export async function POST(req: NextRequest) {
  try {
    const { gameSlug } = await req.json();
    if (!gameSlug) {
      return NextResponse.json({ error: 'gameSlug required' }, { status: 400 });
    }

    const sessionId = await getSessionId();
    const supabase = await createClient();

    // 1. Get player
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (playerErr || !player) {
      return NextResponse.json({ error: 'Player not found. Set nickname first.' }, { status: 400 });
    }

    // 2. Get game by slug
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id')
      .eq('slug', gameSlug)
      .eq('is_active', true)
      .single();

    if (gameErr || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // 3. 기존 waiting/playing 세션 전부 취소 (좀비 세션 방지)
    await supabase
      .from('game_sessions')
      .update({ status: 'cancelled' })
      .eq('game_id', game.id)
      .in('status', ['waiting', 'playing'])
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`);

    // 4. 다른 플레이어의 waiting 세션 찾기
    const { data: waitingSession } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_id', game.id)
      .eq('status', 'waiting')
      .neq('player1_id', player.id)
      .is('player2_id', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (waitingSession) {
      // 합류
      const { data: updated, error: updateErr } = await supabase
        .from('game_sessions')
        .update({
          player2_id: player.id,
          status: 'playing',
          round_choices: {},
          round_result: null,
        })
        .eq('id', waitingSession.id)
        .eq('status', 'waiting') // optimistic lock
        .select('*')
        .single();

      if (updateErr || !updated) {
        // Race condition → 새 waiting 세션 생성
        return await createWaitingSession(supabase, game.id, player.id);
      }

      return NextResponse.json({
        session: updated,
        partykitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? undefined,
      });
    }

    // 5. 대기 세션 없음 → 새로 생성
    return await createWaitingSession(supabase, game.id, player.id);
  } catch (err) {
    console.error('POST /api/match error:', err);
    return NextResponse.json({ error: 'Matchmaking failed' }, { status: 500 });
  }
}

async function createWaitingSession(
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>,
  gameId: string,
  playerId: string
) {
  // 이전에 이긴 세션의 연승을 가져와서 이어받기
  const { data: lastWin } = await supabase
    .from('game_sessions')
    .select('current_streak')
    .eq('game_id', gameId)
    .eq('winner_id', playerId)
    .eq('status', 'finished')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  const incomingStreak = lastWin?.current_streak ?? 0;

  const { data: newSession, error: insertErr } = await supabase
    .from('game_sessions')
    .insert({
      game_id: gameId,
      player1_id: playerId,
      status: 'waiting',
      current_streak: incomingStreak,
      round_choices: {},
      round_result: null,
    })
    .select('*')
    .single();

  if (insertErr) throw insertErr;
  return NextResponse.json({
    session: newSession,
    partykitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? undefined,
  });
}
