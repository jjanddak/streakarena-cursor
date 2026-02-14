import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';
import { broadcastSessionUpdate } from '@/lib/partykit';
import { VALID_CHOICES, determineWinner } from '@/lib/rps';
import type { RPSChoice } from '@/lib/rps';

/**
 * POST /api/game/choose
 * Body: { sessionId: string, choice: 'rock' | 'paper' | 'scissors' }
 * Submits a player's RPS choice.
 * When both choices are in, resolves the round.
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
      // 이미 선택한 상태(이중 클릭/세션 동기화 지연) → 최신 세션 반환해 클라이언트가 결과 화면 등으로 동기화
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
        newStreak = 1;
      }
      if (result === 'draw') {
        newStreak = 0; // 무승부 시 연승 초기화
      }

      const roundResult = {
        winner: result,
        player1_choice: updatedChoices.player1,
        player2_choice: updatedChoices.player2,
      };

      const updateData: Record<string, unknown> = {
        round_choices: result === 'draw' ? {} : updatedChoices, // 무승부 시 다음 라운드를 위해 비우기
        round_result: roundResult,
        current_streak: newStreak,
      };

      if (result !== 'draw') {
        updateData.winner_id = winnerId;
        updateData.status = 'finished';
      }
      // If draw, keep status='playing' so they can choose again

      const { data: updated, error: updateErr } = await supabase
        .from('game_sessions')
        .update(updateData)
        .eq('id', gameSessionId)
        .select('*')
        .single();

      if (updateErr) throw updateErr;

      // If there's a winner, record to rankings and update current_champion
      if (result !== 'draw' && winnerId) {
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

          if (existingRank && existingRank.streak_count < newStreak) {
            await supabase
              .from('rankings')
              .update({
                streak_count: newStreak,
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
              streak_count: newStreak,
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

      await broadcastSessionUpdate(gameSessionId, updated as Record<string, unknown>);
      return NextResponse.json({ session: updated });
    }

    // Only one choice so far - update and wait
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
