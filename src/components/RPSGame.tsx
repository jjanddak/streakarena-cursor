'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

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
};

type Choice = 'rock' | 'paper' | 'scissors';

const CHOICE_EMOJI: Record<string, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

export function RPSGame() {
  const t = useTranslations('game');
  const tHome = useTranslations('home');
  const tCommon = useTranslations('common');

  const [state, setState] = useState<GameState>('nickname');
  const [player, setPlayer] = useState<Player | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [nickname, setNickname] = useState('');
  const [myChoice, setMyChoice] = useState<Choice | null>(null);
  const [error, setError] = useState('');

  // Check if player already exists
  useEffect(() => {
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

  // Auto-join matchmaking when state is 'matching'
  useEffect(() => {
    if (state !== 'matching' || !player) return;

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
          if (data.session.status === 'playing') {
            setState('choosing');
          }
          // If waiting, Realtime subscription will pick up when matched
        }
      } catch {
        if (!cancelled) setError('Matchmaking failed');
      }
    }

    joinMatch();
    return () => { cancelled = true; };
  }, [state, player]);

  // Realtime subscription for game session changes
  useEffect(() => {
    if (!session?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`game_session_${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);

          if (updated.status === 'playing' && !updated.round_result) {
            // Matched or draw reset → choosing
            setState('choosing');
            setMyChoice(null);
          } else if (updated.round_result && updated.round_result.winner !== 'draw') {
            // Game finished with a winner
            setState('result');
          } else if (updated.round_result && updated.round_result.winner === 'draw') {
            // Draw → show briefly then reset
            setState('result');
            setTimeout(() => {
              setState('choosing');
              setMyChoice(null);
            }, 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Handle choice waiting state
  useEffect(() => {
    if (!session || !myChoice) return;
    const choices = session.round_choices || {};
    const myKey = session.player1_id === player?.id ? 'player1' : 'player2';
    if (choices[myKey] && !session.round_result) {
      setState('waiting');
    }
  }, [session, myChoice, player?.id]);

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

  const handleChoice = useCallback(async (choice: Choice) => {
    if (!session || myChoice) return;
    setMyChoice(choice);
    setState('waiting');

    try {
      await fetch('/api/game/choose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, choice }),
      });
    } catch {
      setError('Failed to submit choice');
    }
  }, [session, myChoice]);

  const handlePlayAgain = useCallback(() => {
    setSession(null);
    setMyChoice(null);
    setState('matching');
  }, []);

  const amIPlayer1 = session?.player1_id === player?.id;
  const didIWin =
    session?.round_result &&
    ((amIPlayer1 && session.round_result.winner === 'player1') ||
      (!amIPlayer1 && session.round_result.winner === 'player2'));
  const isDraw = session?.round_result?.winner === 'draw';

  return (
    <div className="mx-auto max-w-lg">
      <AnimatePresence mode="wait">
        {/* NICKNAME SCREEN */}
        {state === 'nickname' && (
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
        {state === 'matching' && (
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

        {/* CHOOSING SCREEN */}
        {(state === 'choosing' || state === 'waiting') && (
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

        {/* RESULT SCREEN */}
        {state === 'result' && session?.round_result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl glass p-8 text-center"
          >
            {/* Result heading */}
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

            {/* Choices display */}
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

            {/* Streak */}
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

            {/* Play again */}
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
