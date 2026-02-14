import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';
import { broadcastSessionUpdate } from '@/lib/partykit';

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

      // ★ 대기 중인 Player 1에게 매칭 알림 (PartyKit broadcast)
      await broadcastSessionUpdate(updated.id, updated as Record<string, unknown>);

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

  // ★ 레이스 컨디션 대응: 내 세션 생성 직후, 다른 플레이어의 대기 세션이 있는지 다시 확인
  // 두 플레이어가 동시에 매칭 요청 → 둘 다 대기 세션 생성 → 서로 못 찾는 문제 해결
  const { data: otherWaiting } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'waiting')
    .neq('player1_id', playerId)
    .is('player2_id', null)
    .neq('id', newSession!.id) // 내 세션 제외
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (otherWaiting) {
    // 다른 플레이어의 대기 세션 발견 → 합류 시도 (optimistic lock)
    const { data: joined, error: joinErr } = await supabase
      .from('game_sessions')
      .update({
        player2_id: playerId,
        status: 'playing',
        round_choices: {},
        round_result: null,
      })
      .eq('id', otherWaiting.id)
      .eq('status', 'waiting') // optimistic lock: 아직 waiting인 경우만
      .select('*')
      .single();

    if (!joinErr && joined) {
      // 내 대기 세션은 취소
      await supabase
        .from('game_sessions')
        .update({ status: 'cancelled' })
        .eq('id', newSession!.id);

      // ★ 대기 중인 Player에게 매칭 알림 (PartyKit broadcast)
      await broadcastSessionUpdate(joined.id, joined as Record<string, unknown>);

      return NextResponse.json({
        session: joined,
        partykitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? undefined,
      });
    }
    // optimistic lock 실패 → 다른 사람이 이미 합류 → 내 대기 세션 유지
  }

  return NextResponse.json({
    session: newSession,
    partykitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? undefined,
  });
}
