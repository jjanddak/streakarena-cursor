export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
} as const;

export const RPS_SLUG = 'rps';

export const FALLBACK_GAMES = [
  {
    id: 'fallback-rps',
    name: 'Rock Paper Scissors',
    slug: RPS_SLUG,
    current_champion: null as { player_name?: string; streak?: number; country_flag?: string } | null,
    order_index: 0,
  },
];
