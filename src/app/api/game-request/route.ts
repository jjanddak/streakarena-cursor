import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionId } from '@/lib/session';

/**
 * POST /api/game-request
 * Body: { title: string, description?: string, html_file_url?: string }
 * Inserts into game_requests. submitted_by = session ID.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, html_file_url } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const sessionId = await getSessionId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('game_requests')
      .insert({
        title: title.trim(),
        description: description != null ? String(description).trim() || null : null,
        html_file_url: html_file_url != null ? String(html_file_url).trim() || null : null,
        submitted_by: sessionId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('game_requests insert error:', error);
      return NextResponse.json(
        { error: 'Failed to submit' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data?.id });
  } catch (e) {
    console.error('POST /api/game-request:', e);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
