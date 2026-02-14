import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isAdminAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  const header = req.headers.get('x-admin-secret');
  return header === secret;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'game';
}

/**
 * PATCH /api/admin/game-requests/[id]
 * Body: { action: 'approve' | 'reject' }
 * Updates status. On approve, inserts a row into games.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data: request, error: fetchErr } = await supabase
      .from('game_requests')
      .select('id, title, html_file_url, status')
      .eq('id', id)
      .single();

    if (fetchErr || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request is no longer pending' },
        { status: 400 }
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error: updateErr } = await supabase
      .from('game_requests')
      .update({ status: newStatus })
      .eq('id', id);

    if (updateErr) {
      console.error('game_requests update error:', updateErr);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    if (action === 'approve') {
      let slug = slugify(request.title);
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const { data: maxOrder } = await supabase
        .from('games')
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const orderIndex = (maxOrder?.order_index ?? 0) + 1;

      const { error: insertErr } = await supabase.from('games').insert({
        name: request.title,
        slug,
        html_file_url: request.html_file_url || null,
        is_active: true,
        order_index: orderIndex,
      });

      if (insertErr) {
        console.error('games insert error:', insertErr);
        return NextResponse.json(
          { error: 'Approved but failed to add game' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e) {
    console.error('PATCH /api/admin/game-requests/[id]:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
