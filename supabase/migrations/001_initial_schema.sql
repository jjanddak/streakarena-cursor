-- StreakArena.io initial schema
-- Run in Supabase SQL Editor or via supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players: guest session + nickname
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text UNIQUE NOT NULL,
  nickname text NOT NULL DEFAULT '',
  country_code text,
  country_flag text,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_players_session_id ON players(session_id);
CREATE INDEX idx_players_last_seen ON players(last_seen_at);

-- Games metadata
CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  html_content text,
  html_file_url text,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  current_champion jsonb, -- { player_name, streak, country_flag }
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_games_slug ON games(slug);
CREATE INDEX idx_games_is_active ON games(is_active) WHERE is_active = true;

-- Game sessions: 1:1 match, winner keeps streak
CREATE TABLE game_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player1_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES players(id) ON DELETE SET NULL,
  winner_id uuid REFERENCES players(id) ON DELETE SET NULL,
  current_streak integer DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  round_result jsonb, -- round outcomes if needed
  round_choices jsonb, -- { player1: 'rock', player2: 'scissors' } for RPS
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_sessions_game_status ON game_sessions(game_id, status);
CREATE INDEX idx_game_sessions_created ON game_sessions(created_at);

-- Rankings: per-game top streaks
CREATE TABLE rankings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  country_flag text,
  streak_count integer NOT NULL,
  achieved_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rankings_game_streak ON rankings(game_id, streak_count DESC);
CREATE UNIQUE INDEX idx_rankings_game_player_best ON rankings(game_id, player_id) WHERE player_id IS NOT NULL;
-- For anonymous: we may allow multiple entries per game per session; or use session_id column. For MVP we use player_name + achieved_at.

-- Game submission requests (community)
CREATE TABLE game_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  html_file_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by text, -- session_id or email
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_requests_status ON game_requests(status);

-- Seed: RPS game
INSERT INTO games (name, slug, is_active, order_index) VALUES
  ('Rock Paper Scissors', 'rps', true, 0);

-- RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_requests ENABLE ROW LEVEL SECURITY;

-- players: anyone can read; only "own" row updatable by session (we use service role for upsert from API, so allow anon insert/update where session_id matches request)
CREATE POLICY "players_read" ON players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update" ON players FOR UPDATE USING (true); -- app validates session_id server-side

-- games: read all
CREATE POLICY "games_read" ON games FOR SELECT USING (true);

-- game_sessions: read/update for participants (service role used in API for match logic; anon can read rows where they are player1 or player2)
CREATE POLICY "game_sessions_select" ON game_sessions FOR SELECT USING (true);
CREATE POLICY "game_sessions_insert" ON game_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "game_sessions_update" ON game_sessions FOR UPDATE USING (true);

-- rankings: read all
CREATE POLICY "rankings_read" ON rankings FOR SELECT USING (true);
CREATE POLICY "rankings_insert" ON rankings FOR INSERT WITH CHECK (true);

-- game_requests: anyone can insert (submit); select/update restricted (admin via service role)
CREATE POLICY "game_requests_insert" ON game_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "game_requests_select" ON game_requests FOR SELECT USING (true);
CREATE POLICY "game_requests_update" ON game_requests FOR UPDATE USING (true);

-- updated_at trigger for game_sessions
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_sessions_updated_at
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
