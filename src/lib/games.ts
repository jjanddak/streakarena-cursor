import { createClient } from '@/lib/supabase/server';
import { FALLBACK_GAMES } from './constants';

export type GameRow = {
  id: string;
  name: string;
  slug: string;
  current_champion: { player_name?: string; streak?: number; country_flag?: string } | null;
  order_index: number;
};

export async function getGames(): Promise<GameRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('games')
      .select('id, name, slug, current_champion, order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      return data as GameRow[];
    }
  } catch {
    // env 미설정 또는 DB 오류 시 폴백
  }
  return FALLBACK_GAMES as GameRow[];
}

export async function getWaitingCount(gameId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('status', 'waiting');
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}
