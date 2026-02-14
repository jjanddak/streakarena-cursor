import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';

/**
 * POST /api/player
 * Body: { nickname: string }
 * Creates or updates player, returns player data.
 */
export async function POST(req: NextRequest) {
  try {
    const { nickname } = await req.json();
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length < 2 || nickname.trim().length > 20) {
      return NextResponse.json({ error: 'Invalid nickname (2-20 chars)' }, { status: 400 });
    }

    const sessionId = await getSessionId();
    const supabase = await createClient();

    // Upsert player
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { session_id: sessionId, nickname: nickname.trim(), last_seen_at: new Date().toISOString() },
        { onConflict: 'session_id' }
      )
      .select('id, session_id, nickname, country_code, country_flag')
      .single();

    if (error) throw error;

    return NextResponse.json({ player: data });
  } catch (err) {
    console.error('POST /api/player error:', err);
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}

/**
 * GET /api/player
 * Returns current player based on session cookie.
 */
export async function GET() {
  try {
    const sessionId = await getSessionId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('players')
      .select('id, session_id, nickname, country_code, country_flag')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) {
      return NextResponse.json({ player: null });
    }

    return NextResponse.json({ player: data });
  } catch {
    return NextResponse.json({ player: null });
  }
}
