'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import PartySocket from 'partysocket';

type GameState = 'nickname' | 'matching' | 'choosing' | 'waiting' | 'result';

type Player = {
  id: string;
  session_id: string;
  nickname: string;
};

type GameSession = {
  id: string;
  game_id: string;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  current_streak: number;
  status: string;
  round_choices: Record<string, string> | null;
  round_result: {
    winner: 'player1' | 'player2' | 'draw';
    player1_choice: string;
    player2_choice: string;
  } | null;
  updated_at?: string;
};

type Choice = 'rock' | 'paper' | 'scissors';

const CHOICE_EMOJI: Record<string, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

// 상대 대기 타임아웃 (30초)
const OPPONENT_TIMEOUT_MS = 30_000;
// waiting 세션 폴링 간격 (playing 전환 보장)
const SESSION_POLL_INTERVAL_MS = 1_500;

const PARTYKIT_PARTY = 'game';

export function RPSGame() {
  const t = useTranslations('game');
  const tHome = useTranslations('home');
  const tCommon = useTranslations('common');

  const [state, setState] = useState<GameState>('nickname');
  const [player, setPlayer] = useState<Player | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [partykitHost, setPartykitHost] = useState<string | null>(null);
  const [partySocketReady, setPartySocketReady] = useState(false);
  const [nickname, setNickname] = useState('');
  const [myChoice, setMyChoice] = useState<Choice | null>(null);
  const [error, setError] = useState('');
  const [opponentLeft, setOpponentLeft] = useState(false);

  // Refs: StrictMode 이중 호출 방지
  const playerCheckRef = useRef(false);
  const matchingRef = useRef(false);

  // ─── 1. 플레이어 존재 여부 확인 (1회만) ───
  useEffect(() => {
    if (playerCheckRef.current) return;
    playerCheckRef.current = true;

    fetch('/api/player')
      .then((r) => r.json())
      .then((data) => {
        if (data.player?.nickname) {
          setPlayer(data.player);
          setNickname(data.player.nickname);
          setState('matching');
        }
      })
      .catch(() => {});
  }, []);

  // ─── 2. 세션 정리 후 매칭 화면으로 ───
  const resetToMatching = useCallback(() => {
    setSession(null);
    setPartykitHost(null);
    setPartySocketReady(false);
    setMyChoice(null);
    setOpponentLeft(false);
    setError('');
    matchingRef.current = false; // 다음 매칭 허용
    setState('matching');
  }, []);

  const abandonSession = useCallback(async (sessionId: string) => {
    try {
      await fetch('/api/game/session/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // 실패해도 무시 (서버에서 이미 종료됐을 수 있음)
    }
  }, []);

  const abandonAndRematch = useCallback(async () => {
    const sid = session?.id;
    if (sid) await abandonSession(sid);
    resetToMatching();
  }, [session?.id, abandonSession, resetToMatching]);

  // ─── 3. 매칭 (1회만 실행) ───
  useEffect(() => {
    if (state !== 'matching' || !player) return;
    if (matchingRef.current) return;
    matchingRef.current = true;

    let cancelled = false;

    async function joinMatch() {
      try {
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameSlug: 'rps' }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.session) {
          setSession(data.session);
          if (data.partykitHost != null) {
            setPartykitHost(data.partykitHost);
          }
          if (data.session.status === 'playing') {
            setState('choosing');
          }
        }
      } catch {
        if (!cancelled) setError('Matchmaking failed');
      }
    }

    joinMatch();
    return () => { cancelled = true; };
  }, [state, player]);

  // ─── 3b. waiting 세션 폴링 (playing 전환 보장) ───
  useEffect(() => {
    const sid = session?.id;
    if (!sid || session?.status !== 'waiting') return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/game/session?sessionId=${encodeURIComponent(sid)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.session) {
          const next = data.session as GameSession;
          if (next.status === 'playing') {
            setSession(next);
            setState('choosing');
            setMyChoice(null);
            setOpponentLeft(false);
            return;
          }
          if (next.status === 'cancelled') {
            resetToMatching();
            return;
          }
        }
      } catch {
        // 무시 후 다음 폴링
      }
      if (!cancelled) {
        timerId = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      }
    };
    let timerId = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [session?.id, session?.status, resetToMatching]);

  // ─── 4. PartyKit: 게임 룸 WebSocket (session_update / player_left) ───
  // 호스트: 매칭 응답 partykitHost 우선, 없으면 env. 연결됐을 때만 플레이 가능.
  useEffect(() => {
    if (!session?.id || !player?.id || session.status !== 'playing') return;

    const host = partykitHost ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? null;
    if (!host) return;

    setPartySocketReady(false);
    const socket = new PartySocket({
      host,
      party: PARTYKIT_PARTY,
      room: session.id,
    });

    const onMessage = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string) as
          | { type: 'session_update'; session: GameSession }
          | { type: 'player_left'; playerId: string };
        if (payload.type === 'session_update' && payload.session) {
          const updated = payload.session;
          setSession(updated);
          if (updated.status === 'cancelled') {
            resetToMatching();
            return;
          }
          if (updated.status === 'playing' && !updated.round_result) {
            setState('choosing');
            setMyChoice(null);
            setOpponentLeft(false);
          } else if (updated.round_result && updated.round_result.winner !== 'draw') {
            setState('result');
          } else if (updated.round_result && updated.round_result.winner === 'draw') {
            setState('result');
            setTimeout(() => {
              setState('choosing');
              setMyChoice(null);
            }, 2000);
          }
        } else if (payload.type === 'player_left' && payload.playerId) {
          const opponentId =
            session.player1_id === player.id ? session.player2_id : session.player1_id;
          if (payload.playerId === opponentId) {
            setOpponentLeft(true);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    const onOpen = () => {
      socket.send(JSON.stringify({ type: 'join', playerId: player.id }));
      setPartySocketReady(true);
    };

    const onClose = () => {
      setPartySocketReady(false);
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('open', onOpen);
    socket.addEventListener('close', onClose);
    if (socket.readyState === WebSocket.OPEN) {
      onOpen();
    }

    return () => {
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('close', onClose);
      socket.close();
      setPartySocketReady(false);
    };
  }, [
    session?.id,
    session?.status,
    session?.player1_id,
    session?.player2_id,
    player?.id,
    partykitHost,
    resetToMatching,
  ]);

  // ─── 5. 상대 이탈 감지 시 자동 abandon ───
  useEffect(() => {
    if (!opponentLeft || !session?.id) return;
    // 이미 결과가 나왔으면 무시
    if (session.status === 'finished') return;

    const timer = setTimeout(() => {
      abandonAndRematch();
    }, 2000); // 2초간 "상대가 나갔습니다" 표시 후 재매칭

    return () => clearTimeout(timer);
  }, [opponentLeft, session?.id, session?.status, abandonAndRematch]);

  // ─── 5b. 검은 화면 방지: result 상태인데 round_result 없으면 재매칭 ───
  useEffect(() => {
    if (state === 'result' && (!session || !session.round_result)) {
      resetToMatching();
    }
  }, [state, session?.round_result, session, resetToMatching]);

  // ─── 6. 내 선택 후 상대 대기 타임아웃 ───
  useEffect(() => {
    if (state !== 'waiting' || !session?.id || !myChoice) return;
    const choices = session.round_choices || {};
    // 둘 다 선택했으면 타임아웃 불필요
    if (choices.player1 && choices.player2) return;

    const timer = setTimeout(() => abandonAndRematch(), OPPONENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state, session?.id, session?.round_choices, myChoice, abandonAndRematch]);

  // ─── 7. 닉네임 설정 ───
  const handleSetNickname = useCallback(async () => {
    if (!nickname.trim() || nickname.trim().length < 2) {
      setError(tHome('nicknameRequired'));
      return;
    }
    setError('');
    try {
      const res = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (data.player) {
        setPlayer(data.player);
        setState('matching');
      } else {
        setError(data.error || 'Failed');
      }
    } catch {
      setError('Network error');
    }
  }, [nickname, tHome]);

  // ─── 8. 선택 제출 ───
  const handleChoice = useCallback(async (choice: Choice) => {
    if (!session || myChoice) return;
    setMyChoice(choice);
    setState('waiting');
    setError('');

    try {
      const res = await fetch('/api/game/choose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, choice }),
      });
      const data = await res.json();

      if (!res.ok) {
        // 세션이 없거나 이미 끝남 → 매칭부터 다시
        if (res.status === 404) {
          resetToMatching();
          return;
        }
        if (data.error === 'Already chose') {
          // 상태 동기화 이슈(이중 클릭/지연 등) → 현재 세션 버리고 새 매칭 시작
          const sid = (data.session as GameSession | undefined)?.id ?? session?.id;
          if (sid) await abandonSession(sid);
          resetToMatching();
          return;
        }
        // 기타 에러 → 매칭부터 다시
        resetToMatching();
        return;
      }

      // 세션/결과 갱신은 PartyKit broadcast로만 수신 (양쪽 동시 반영). API 응답으로는 UI 갱신하지 않음.
    } catch {
      setError('Failed to submit choice');
      setState('choosing');
      setMyChoice(null);
    }
  }, [session, myChoice, resetToMatching, abandonSession]);

  // ─── 9. 다시 하기 ───
  const handlePlayAgain = useCallback(() => {
    resetToMatching();
  }, [resetToMatching]);

  // ─── 파생 상태 ───
  const amIPlayer1 = session?.player1_id === player?.id;
  const didIWin =
    session?.round_result &&
    ((amIPlayer1 && session.round_result.winner === 'player1') ||
      (!amIPlayer1 && session.round_result.winner === 'player2'));
  const isDraw = session?.round_result?.winner === 'draw';

  return (
    <div className="mx-auto max-w-lg">
      <AnimatePresence mode="wait">
        {/* 상대 이탈 오버레이 */}
        {opponentLeft && state !== 'result' && (
          <motion.div
            key="opponent-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl glass p-8 text-center"
          >
            <p className="text-xl font-bold text-yellow-400">{t('opponentLeft')}</p>
            <p className="mt-2 text-sm text-white/40">{t('matching')}</p>
            <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-500" />
          </motion.div>
        )}

        {/* NICKNAME SCREEN */}
        {!opponentLeft && state === 'nickname' && (
          <motion.div
            key="nickname"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl glass p-8 text-center"
          >
            <h2 className="text-xl font-bold text-white">{tHome('pickNickname')}</h2>
            <p className="mt-2 text-sm text-white/50">{tHome('nicknameRequired')}</p>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetNickname()}
              placeholder={tHome('nicknamePlaceholder')}
              maxLength={20}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-white placeholder-white/30 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button
              onClick={handleSetNickname}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:brightness-110 transition-all"
            >
              {tCommon('play')}
            </button>
          </motion.div>
        )}

        {/* MATCHING SCREEN */}
        {!opponentLeft && state === 'matching' && (
          <motion.div
            key="matching"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl glass p-8 text-center"
          >
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-brand-500" />
            <h2 className="text-xl font-bold text-white">{t('matching')}</h2>
            <p className="mt-2 text-sm text-white/40">
              {player?.nickname && `${player.nickname} · `}{tCommon('loading')}
            </p>
          </motion.div>
        )}

        {/* 실시간 서버 미설정: playing인데 호스트 없음 */}
        {!opponentLeft &&
          (state === 'choosing' || state === 'waiting') &&
          session?.status === 'playing' &&
          !partykitHost &&
          !process.env.NEXT_PUBLIC_PARTYKIT_HOST && (
            <motion.div
              key="partykit-not-configured"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl glass p-8 text-center"
            >
              <p className="text-lg font-medium text-yellow-400">{t('partykitNotConfigured')}</p>
            </motion.div>
          )}

        {/* 실시간 연결 대기: 호스트는 있는데 PartyKit 미연결 */}
        {!opponentLeft &&
          (state === 'choosing' || state === 'waiting') &&
          session?.status === 'playing' &&
          (partykitHost ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST) &&
          !partySocketReady && (
            <motion.div
              key="partykit-connecting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl glass p-8 text-center"
            >
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-brand-500" />
              <h2 className="text-xl font-bold text-white">{t('connectingPartykit')}</h2>
              <p className="mt-2 text-sm text-white/40">
                {t('partykitServerRequired')}
              </p>
            </motion.div>
          )}

        {/* CHOOSING SCREEN: PartySocket 연결된 경우에만 표시 */}
        {!opponentLeft &&
          (state === 'choosing' || state === 'waiting') &&
          partySocketReady && (
            <motion.div
              key="choosing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl glass p-8"
            >
              <h2 className="text-center text-xl font-bold text-white">{t('yourChoice')}</h2>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {(['rock', 'paper', 'scissors'] as Choice[]).map((c) => (
                  <motion.button
                    key={c}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleChoice(c)}
                    disabled={!!myChoice}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all ${
                      myChoice === c
                        ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/20'
                        : myChoice
                        ? 'border-white/5 bg-white/[0.02] opacity-40'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="text-4xl">{CHOICE_EMOJI[c]}</span>
                    <span className="text-sm font-medium text-white/80">{t(c)}</span>
                  </motion.button>
                ))}
              </div>
              {state === 'waiting' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-center text-sm text-white/40"
                >
                  {tCommon('loading')}
                </motion.p>
              )}
            </motion.div>
          )}

        {/* RESULT SCREEN - opponentLeft여도 게임 끝난 뒤 상대가 먼저 나간 경우 결과 화면 유지 */}
        {state === 'result' && session?.round_result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl glass p-8 text-center"
          >
            <motion.h2
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
              className={`text-3xl font-extrabold ${
                isDraw
                  ? 'text-yellow-400'
                  : didIWin
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}
            >
              {isDraw ? t('draw') : didIWin ? t('youWin') : t('youLose')}
            </motion.h2>

            <div className="mt-6 flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-xs text-white/40">You</p>
                <span className="text-5xl">
                  {CHOICE_EMOJI[amIPlayer1 ? session.round_result.player1_choice : session.round_result.player2_choice]}
                </span>
              </div>
              <span className="text-2xl font-bold text-white/20">VS</span>
              <div className="text-center">
                <p className="text-xs text-white/40">Opponent</p>
                <span className="text-5xl">
                  {CHOICE_EMOJI[amIPlayer1 ? session.round_result.player2_choice : session.round_result.player1_choice]}
                </span>
              </div>
            </div>

            {!isDraw && didIWin && session.current_streak > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-4 text-sm font-medium text-brand-400"
              >
                {t('streak', { count: session.current_streak })}
              </motion.p>
            )}

            {!isDraw && (
              <button
                onClick={handlePlayAgain}
                className="mt-6 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:brightness-110 transition-all"
              >
                {t('playAgain')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
