-- Allow 'cancelled' status for game_sessions (새로고침/상대 이탈 시 세션 취소 후 재매칭)
ALTER TABLE game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_status_check;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_status_check
  CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled'));
