import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';

/**
 * POST /api/match
 * Body: { gameSlug: string }
 * Joins matchmaking queue: finds waiting session or creates one.
 * Returns the game_session row.
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

    // 3. Check if player is already in a waiting/playing session
    const { data: existingSession } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_id', game.id)
      .in('status', ['waiting', 'playing'])
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      return NextResponse.json({ session: existingSession });
    }

    // 4. Find a waiting session (not our own)
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
      // Join existing session
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
        // Race condition: someone else took it, create new
        return await createWaitingSession(supabase, game.id, player.id);
      }

      return NextResponse.json({ session: updated });
    }

    // 5. No waiting session found → create one
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
  const { data: newSession, error: insertErr } = await supabase
    .from('game_sessions')
    .insert({
      game_id: gameId,
      player1_id: playerId,
      status: 'waiting',
      current_streak: 0,
      round_choices: {},
      round_result: null,
    })
    .select('*')
    .single();

  if (insertErr) throw insertErr;
  return NextResponse.json({ session: newSession });
}
