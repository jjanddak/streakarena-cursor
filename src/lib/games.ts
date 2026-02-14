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

export type RankingRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  player_name: string;
  country_flag: string | null;
  streak_count: number;
  achieved_at: string;
};

export async function getGameBySlug(slug: string): Promise<GameRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('games')
      .select('id, name, slug, current_champion, order_index')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return data as GameRow;
  } catch {
    return null;
  }
}

export async function getRankingsByGameId(gameId: string, limit = 100): Promise<RankingRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('rankings')
      .select('id, game_id, player_id, player_name, country_flag, streak_count, achieved_at')
      .eq('game_id', gameId)
      .order('streak_count', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as RankingRow[];
  } catch {
    return [];
  }
}
