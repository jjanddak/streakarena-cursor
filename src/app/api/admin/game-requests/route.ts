import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isAdminAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // MVP: no secret => allow
  const header = req.headers.get('x-admin-secret');
  return header === secret;
}

/**
 * GET /api/admin/game-requests?status=pending
 * Returns list of game_requests. Optional ADMIN_SECRET env for protection.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('game_requests')
      .select('id, title, description, html_file_url, submitted_by, created_at, status')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('game_requests select error:', error);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (e) {
    console.error('GET /api/admin/game-requests:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
