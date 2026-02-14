import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';
import { broadcastSessionUpdate, broadcastSessionEnd } from '@/lib/partykit';
import { VALID_CHOICES, determineWinner } from '@/lib/rps';
import type { RPSChoice } from '@/lib/rps';

/**
 * POST /api/game/choose
 * Body: { sessionId: string, choice: 'rock' | 'paper' | 'scissors' }
 *
 * 핵심 변경: 무승부(draw)도 게임 종료(finished) 처리.
 * 모든 결과(승/패/무승부)에서 세션이 종료되므로
 * 클라이언트는 결과 확인 후 새 매칭을 시작해야 함.
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId: gameSessionId, choice } = await req.json();

    if (!gameSessionId || !VALID_CHOICES.includes(choice)) {
      return NextResponse.json({ error: 'Invalid sessionId or choice' }, { status: 400 });
    }

    const playerSessionId = await getSessionId();
    const supabase = await createClient();

    // 1. Get player
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('session_id', playerSessionId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 400 });
    }

    // 2. Get game session
    const { data: session } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', gameSessionId)
      .eq('status', 'playing')
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Game session not found or not playing' }, { status: 404 });
    }

    // 3. Determine which player we are
    const isPlayer1 = session.player1_id === player.id;
    const isPlayer2 = session.player2_id === player.id;
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // 4. Store choice
    const existingChoices = (session.round_choices as Record<string, string>) || {};
    const choiceKey = isPlayer1 ? 'player1' : 'player2';

    if (existingChoices[choiceKey]) {
      // 이미 선택한 상태(이중 클릭/세션 동기화 지연) → 최신 세션 반환
      const { data: currentSession } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameSessionId)
        .single();
      return NextResponse.json(
        { error: 'Already chose', session: currentSession ?? undefined },
        { status: 400 }
      );
    }

    const updatedChoices = { ...existingChoices, [choiceKey]: choice };

    // 5. Check if both players have chosen
    const bothChosen = updatedChoices.player1 && updatedChoices.player2;

    if (bothChosen) {
      // Resolve round
      const result = determineWinner(
        updatedChoices.player1 as RPSChoice,
        updatedChoices.player2 as RPSChoice
      );

      let winnerId: string | null = null;
      let newStreak = session.current_streak || 0;

      if (result === 'player1') {
        winnerId = session.player1_id;
        newStreak += 1;
      } else if (result === 'player2') {
        winnerId = session.player2_id;
        // player2 승리 = player1(세션 주체) 패배 → 연승 0
        newStreak = 0;
      } else {
        // 무승부: 연승 초기화
        newStreak = 0;
      }

      const roundResult = {
        winner: result,
        player1_choice: updatedChoices.player1,
        player2_choice: updatedChoices.player2,
      };

      // ★ 핵심 변경: 모든 결과(승/패/무승부)에서 세션 종료
      const updateData: Record<string, unknown> = {
        round_choices: updatedChoices,
        round_result: roundResult,
        current_streak: newStreak,
        status: 'finished',
      };

      if (winnerId) {
        updateData.winner_id = winnerId;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('game_sessions')
        .update(updateData)
        .eq('id', gameSessionId)
        .select('*')
        .single();

      if (updateErr) throw updateErr;

      // 현재 유저(요청자)가 이겼을 때만 랭킹 갱신. 상대는 본인 세션에서 갱신함.
      if (result !== 'draw' && winnerId && winnerId === player.id) {
        // 랭킹에 쓸 연승: player1이면 newStreak, player2면 현재 유저의 직전 연승+1
        let streakForRanking = newStreak;
        if (isPlayer2) {
          const { data: myLast } = await supabase
            .from('game_sessions')
            .select('winner_id, current_streak')
            .eq('game_id', session.game_id)
            .eq('status', 'finished')
            .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
          const prev = myLast && myLast.winner_id === player.id ? (myLast.current_streak ?? 0) : 0;
          streakForRanking = prev + 1;
        }

        const { data: winnerPlayer } = await supabase
          .from('players')
          .select('nickname, country_flag')
          .eq('id', winnerId)
          .single();

        if (winnerPlayer) {
          // Upsert ranking: update if this streak is better
          const { data: existingRank } = await supabase
            .from('rankings')
            .select('id, streak_count')
            .eq('game_id', session.game_id)
            .eq('player_id', winnerId)
            .single();

          if (existingRank && existingRank.streak_count < streakForRanking) {
            await supabase
              .from('rankings')
              .update({
                streak_count: streakForRanking,
                player_name: winnerPlayer.nickname,
                country_flag: winnerPlayer.country_flag,
                achieved_at: new Date().toISOString(),
              })
              .eq('id', existingRank.id);
          } else if (!existingRank) {
            await supabase.from('rankings').insert({
              game_id: session.game_id,
              player_id: winnerId,
              player_name: winnerPlayer.nickname,
              country_flag: winnerPlayer.country_flag,
              streak_count: streakForRanking,
            });
          }

          // Update games.current_champion to the current top for this game
          const { data: topRank } = await supabase
            .from('rankings')
            .select('player_name, country_flag, streak_count')
            .eq('game_id', session.game_id)
            .order('streak_count', { ascending: false })
            .limit(1)
            .single();

          if (topRank) {
            await supabase
              .from('games')
              .update({
                current_champion: {
                  player_name: topRank.player_name,
                  streak: topRank.streak_count,
                  country_flag: topRank.country_flag ?? undefined,
                },
              })
              .eq('id', session.game_id);
          }
        }
      }

      // ★ session_end 브로드캐스트: PartyKit 룸 종료 신호
      await broadcastSessionEnd(gameSessionId, updated as Record<string, unknown>);
      return NextResponse.json({ session: updated });
    }

    // Only one choice so far - update and wait (중간 업데이트)
    const { data: updated, error: updateErr } = await supabase
      .from('game_sessions')
      .update({ round_choices: updatedChoices })
      .eq('id', gameSessionId)
      .select('*')
      .single();

    if (updateErr) throw updateErr;
    await broadcastSessionUpdate(gameSessionId, updated as Record<string, unknown>);
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error('POST /api/game/choose error:', err);
    return NextResponse.json({ error: 'Failed to submit choice' }, { status: 500 });
  }
}
