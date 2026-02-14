'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import PartySocket from 'partysocket';

/**
 * RPSGame – 가위바위보 실시간 대전 컴포넌트 (전면 리팩토링)
 *
 * 핵심 원칙:
 * 1. 모든 게임 결과(승/패/무승부) 후 WebSocket 종료 + PartyKit 세션 종료
 * 2. 매번 새 상대와 매칭 (같은 상대와 반복 대전 불가)
 * 3. 어떤 상황에서도 UI가 멈추거나 무한로딩 되지 않도록 타임아웃 & 자동 복구
 * 4. beforeunload로 페이지 이탈 시 세션 정리
 */

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

// ─── 타임아웃 상수 ───
/** 매칭 대기 최대 시간 (60초 후 자동 재시도) */
const MATCHING_TIMEOUT_MS = 60_000;
/** PartyKit 연결 대기 최대 시간 (10초 후 재매칭) */
const PARTYKIT_CONNECT_TIMEOUT_MS = 10_000;
/** 상대 선택 대기 최대 시간 (30초 후 세션 abandon + 재매칭) */
const OPPONENT_CHOICE_TIMEOUT_MS = 30_000;
/** 무승부 결과 표시 시간 (2.5초 후 자동 재매칭) */
const DRAW_DISPLAY_MS = 2_500;
/** 상대 이탈 표시 시간 (2초 후 자동 재매칭) */
const OPPONENT_LEFT_DISPLAY_MS = 2_000;
/** waiting → playing 전환 확인 폴링 간격 */
const SESSION_POLL_INTERVAL_MS = 1_500;
/** 글로벌 스턱 방지 타임아웃 (choosing/waiting 2분 초과 시 강제 복구) */
const GLOBAL_STUCK_TIMEOUT_MS = 120_000;
/** 매칭 에러 후 재시도 대기 시간 */
const MATCH_RETRY_DELAY_MS = 3_000;
/** waiting 세션이 playing으로 전환되지 않을 때 재매칭까지 최대 폴링 횟수 */
const MAX_WAITING_POLLS = 10; // ~15초

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
  // ★ 매칭 재시도 카운터: 값이 변경되면 매칭 effect가 다시 실행됨
  const [matchAttempt, setMatchAttempt] = useState(0);

  // Refs: StrictMode 이중 호출 방지 + 최신 값 참조
  const playerCheckRef = useRef(false);
  const matchingRef = useRef(false);
  const socketRef = useRef<PartySocket | null>(null);
  const myChoiceRef = useRef<Choice | null>(null);
  const stateRef = useRef<GameState>(state);
  const sessionRef = useRef<GameSession | null>(session);

  // 최신 값을 ref에 동기화 (비동기 콜백에서 stale closure 방지)
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ─── Helper: WebSocket 정리 ───
  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      try { socket.close(); } catch { /* ignore */ }
      socketRef.current = null;
    }
    setPartySocketReady(false);
  }, []);

  // ─── Helper: 세션 abandon API 호출 (fire-and-forget) ───
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

  // ─── 완전 초기화 후 매칭 화면으로 ───
  const resetToMatching = useCallback(() => {
    closeSocket();
    setSession(null);
    setPartykitHost(null);
    setMyChoice(null);
    myChoiceRef.current = null;
    setOpponentLeft(false);
    setError('');
    matchingRef.current = false; // 다음 매칭 허용
    setState('matching');
    setMatchAttempt((a) => a + 1); // ★ 매칭 effect 강제 재실행
  }, [closeSocket]);

  // ─── Abandon + 재매칭 (소켓 닫고, 세션 취소하고, 매칭으로 복귀) ───
  const abandonAndRematch = useCallback(async () => {
    const sid = sessionRef.current?.id;
    closeSocket();
    if (sid) await abandonSession(sid);
    setSession(null);
    setPartykitHost(null);
    setMyChoice(null);
    myChoiceRef.current = null;
    setOpponentLeft(false);
    setError('');
    matchingRef.current = false;
    setState('matching');
    setMatchAttempt((a) => a + 1); // ★ 매칭 effect 강제 재실행
  }, [closeSocket, abandonSession]);

  // ═══════════════════════════════════════════
  // 1. 플레이어 존재 여부 확인 (1회만)
  // ═══════════════════════════════════════════
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

  // ═══════════════════════════════════════════
  // 2. beforeunload: 페이지 이탈/새로고침 시 세션 정리
  // ═══════════════════════════════════════════
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sid = sessionRef.current?.id;
      if (sid) {
        // sendBeacon: 페이지가 닫혀도 요청이 전송됨
        navigator.sendBeacon(
          '/api/game/session/abandon',
          new Blob(
            [JSON.stringify({ sessionId: sid })],
            { type: 'application/json' }
          )
        );
      }
      // 소켓 정리
      const socket = socketRef.current;
      if (socket) {
        try { socket.close(); } catch { /* ignore */ }
        socketRef.current = null;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ═══════════════════════════════════════════
  // 3. 매칭 (matching 상태에서 1회만 실행)
  // ═══════════════════════════════════════════
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

        if (!res.ok) {
          setError(data.error || 'Matchmaking failed');
          // ★ 재시도: matchAttempt를 증가시켜 effect 재실행
          setTimeout(() => {
            if (!cancelled) {
              matchingRef.current = false;
              setMatchAttempt((a) => a + 1);
            }
          }, MATCH_RETRY_DELAY_MS);
          return;
        }

        if (data.session) {
          setSession(data.session);
          if (data.partykitHost != null) {
            setPartykitHost(data.partykitHost);
          }
          if (data.session.status === 'playing') {
            setState('choosing');
          }
          // status === 'waiting' → 폴링 effect가 처리
        }
      } catch {
        if (!cancelled) {
          setError('Matchmaking failed');
          // ★ 재시도: matchAttempt를 증가시켜 effect 재실행
          setTimeout(() => {
            if (!cancelled) {
              matchingRef.current = false;
              setMatchAttempt((a) => a + 1);
            }
          }, MATCH_RETRY_DELAY_MS);
        }
      }
    }

    joinMatch();

    // 매칭 타임아웃: 60초 후 자동 재시도
    const timeout = setTimeout(() => {
      if (!cancelled && stateRef.current === 'matching') {
        matchingRef.current = false;
        setError('');
        // ★ matchAttempt 증가로 effect 강제 재실행
        setMatchAttempt((a) => a + 1);
      }
    }, MATCHING_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [state, player, matchAttempt]);

  // ═══════════════════════════════════════════
  // 3b. waiting 세션 폴링 (playing 전환 감지)
  // ★ 레이스 컨디션 대응: MAX_WAITING_POLLS 초과 시 세션 abandon 후 재매칭
  // ═══════════════════════════════════════════
  useEffect(() => {
    const sid = session?.id;
    if (!sid || session?.status !== 'waiting') return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;
    let pollCount = 0;

    const poll = async () => {
      if (cancelled) return;
      pollCount++;

      // ★ 대기 세션이 너무 오래 playing으로 전환되지 않음
      //   → 레이스 컨디션으로 양쪽 모두 대기 세션을 만든 경우
      //   → abandon 후 재매칭 시도
      if (pollCount > MAX_WAITING_POLLS) {
        if (!cancelled) {
          await abandonSession(sid).catch(() => {});
          resetToMatching();
        }
        return;
      }

      try {
        const res = await fetch(`/api/game/session?sessionId=${encodeURIComponent(sid)}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.session) {
          const next = data.session as GameSession;
          if (next.status === 'playing') {
            setSession(next);
            // ★ 이미 선택한 상태면 리셋하지 않음 (중간 broadcast와 동일한 보호)
            if (!myChoiceRef.current) {
              setState('choosing');
              setMyChoice(null);
              setOpponentLeft(false);
            }
            return; // 폴링 종료
          }
          if (next.status === 'cancelled' || next.status === 'finished') {
            resetToMatching();
            return; // 폴링 종료
          }
        }
      } catch {
        // 무시 후 다음 폴링
      }
      if (!cancelled) {
        timerId = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      }
    };

    timerId = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [session?.id, session?.status, resetToMatching, abandonSession]);

  // WebSocket 연결 대상 룸 ID: waiting(사전 연결) 또는 playing(활성 게임)
  // session.id가 같으면 status가 waiting→playing으로 바뀌어도 재연결하지 않음
  const wsRoomId =
    session?.id && (session.status === 'waiting' || session.status === 'playing')
      ? session.id
      : null;

  // ═══════════════════════════════════════════
  // 4. PartyKit WebSocket 연결 (waiting 사전 연결 + playing 활성 게임)
  // ★ waiting 중 사전 연결하여 매칭 즉시 감지 (폴링 지연 제거)
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (!wsRoomId || !player?.id) return;

    const host = partykitHost ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? null;
    if (!host) return;

    // 이전 소켓이 있으면 정리
    closeSocket();
    setPartySocketReady(false);

    const socket = new PartySocket({
      host,
      party: PARTYKIT_PARTY,
      room: wsRoomId,
      maxRetries: 3, // 비정상 끊김 시 최대 3번 재연결
    });
    socketRef.current = socket;

    // ── 메시지 핸들러 ──
    const onMessage = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string);

        // ★ session_end: 게임 완전 종료 (승/패/무승부)
        if (payload.type === 'session_end' && payload.session) {
          const updated = payload.session as GameSession;
          setSession(updated);
          // 소켓 즉시 정리
          try { socket.close(); } catch { /* ignore */ }
          socketRef.current = null;
          setPartySocketReady(false);

          if (updated.round_result) {
            setState('result');
          } else {
            // round_result 없는 종료 (abandoned 등) → 재매칭
            resetToMatching();
          }
          return;
        }

        // session_update: 매칭 완료 알림 또는 중간 업데이트
        if (payload.type === 'session_update' && payload.session) {
          const updated = payload.session as GameSession;
          setSession(updated);

          // 취소됨 → 재매칭
          if (updated.status === 'cancelled') {
            try { socket.close(); } catch { /* ignore */ }
            socketRef.current = null;
            resetToMatching();
            return;
          }

          // finished (session_end 못 받은 경우 fallback)
          if (updated.status === 'finished') {
            try { socket.close(); } catch { /* ignore */ }
            socketRef.current = null;
            setPartySocketReady(false);
            if (updated.round_result) {
              setState('result');
            } else {
              resetToMatching();
            }
            return;
          }

          // playing + round_result 없음 → choosing 전환
          // ★ 핵심 수정: myChoiceRef로 이미 선택한 상태인지 확인
          //   - 매칭 완료 (waiting→playing): myChoice 없음 → choosing 전환 ✓
          //   - 중간 업데이트 (한 명 선택): myChoice 있으면 리셋 안 함 ✓
          if (updated.status === 'playing' && !updated.round_result) {
            if (!myChoiceRef.current) {
              setState('choosing');
              setOpponentLeft(false);
            }
          }
        }

        // player_left: 상대 이탈 감지
        if (payload.type === 'player_left' && payload.playerId) {
          const currentSession = sessionRef.current;
          const opponentId =
            currentSession?.player1_id === player.id
              ? currentSession?.player2_id
              : currentSession?.player1_id;
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

    // 이미 연결되어 있으면 바로 join 전송
    if (socket.readyState === WebSocket.OPEN) {
      onOpen();
    }

    // ★ 연결 타임아웃: 10초 내에 연결 안 되면 복구
    const connectTimeout = setTimeout(() => {
      if (socketRef.current === socket && socket.readyState !== WebSocket.OPEN) {
        try { socket.close(); } catch { /* ignore */ }
        socketRef.current = null;
        // matching 상태에서는 폴링이 fallback하므로 abandon 불필요
        const currentState = stateRef.current;
        if (currentState === 'choosing' || currentState === 'waiting') {
          abandonAndRematch();
        }
      }
    }, PARTYKIT_CONNECT_TIMEOUT_MS);

    return () => {
      clearTimeout(connectTimeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('close', onClose);
      try { socket.close(); } catch { /* ignore */ }
      socketRef.current = null;
      setPartySocketReady(false);
    };
  }, [
    wsRoomId,
    player?.id,
    partykitHost,
    closeSocket,
    resetToMatching,
    abandonAndRematch,
  ]);

  // ═══════════════════════════════════════════
  // 5a. 상대 이탈 감지 → 자동 재매칭
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (!opponentLeft || !session?.id) return;
    // 이미 결과가 나왔으면 무시 (결과 화면 유지)
    if (session.status === 'finished') return;

    const timer = setTimeout(() => {
      abandonAndRematch();
    }, OPPONENT_LEFT_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [opponentLeft, session?.id, session?.status, abandonAndRematch]);

  // ═══════════════════════════════════════════
  // 5b. result 상태인데 round_result 없으면 즉시 복구
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (state === 'result' && (!session || !session.round_result)) {
      resetToMatching();
    }
  }, [state, session, resetToMatching]);

  // ═══════════════════════════════════════════
  // 5c. 무승부 자동 재매칭 (2.5초 후 새 상대 매칭)
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (state !== 'result') return;
    if (!session?.round_result) return;
    if (session.round_result.winner !== 'draw') return;

    const timer = setTimeout(() => {
      resetToMatching();
    }, DRAW_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [state, session?.round_result, resetToMatching]);

  // ═══════════════════════════════════════════
  // 6. 내 선택 후 상대 대기 타임아웃 (30초)
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (state !== 'waiting' || !session?.id || !myChoice) return;

    const timer = setTimeout(() => {
      abandonAndRematch();
    }, OPPONENT_CHOICE_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [state, session?.id, myChoice, abandonAndRematch]);

  // ═══════════════════════════════════════════
  // 7. 글로벌 스턱 감지 (choosing/waiting 2분 초과 시 강제 복구)
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (state !== 'choosing' && state !== 'waiting') return;

    const timer = setTimeout(() => {
      abandonAndRematch();
    }, GLOBAL_STUCK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [state, abandonAndRematch]);

  // ═══════════════════════════════════════════
  // 8. 닉네임 설정
  // ═══════════════════════════════════════════
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

  // ═══════════════════════════════════════════
  // 9. 선택 제출
  // ═══════════════════════════════════════════
  const handleChoice = useCallback(async (choice: Choice) => {
    if (!session || myChoice) return;
    setMyChoice(choice);
    myChoiceRef.current = choice;
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
        if (res.status === 404) {
          // 세션이 없거나 이미 끝남 → 매칭부터 다시
          resetToMatching();
          return;
        }
        if (data.error === 'Already chose') {
          // ★ 이중 제출 (네트워크 지연 등) → 서버 반환 세션으로 동기화
          // abandon 대신 현재 세션 유지 (상대 선택 대기 or 결과 표시)
          if (data.session) {
            const s = data.session as GameSession;
            setSession(s);
            if (s.status === 'finished' && s.round_result) {
              closeSocket();
              setState('result');
            }
            // 아직 진행 중이면 waiting 유지
          }
          return;
        }
        // 기타 에러 → 매칭부터 다시
        resetToMatching();
        return;
      }

      // ★ API 응답에 완료된 세션이 있으면 즉시 결과 반영
      // (상대 플레이어는 PartyKit broadcast로 받음)
      if (data.session?.status === 'finished' && data.session?.round_result) {
        setSession(data.session);
        closeSocket();
        setState('result');
      }
      // 아직 한 명만 선택한 경우 → PartyKit broadcast 대기
    } catch {
      setError('Failed to submit choice');
      setState('choosing');
      setMyChoice(null);
      myChoiceRef.current = null;
    }
  }, [session, myChoice, resetToMatching, closeSocket]);

  // ═══════════════════════════════════════════
  // 10. 다시 하기 (새 상대 매칭)
  // ═══════════════════════════════════════════
  const handlePlayAgain = useCallback(() => {
    closeSocket();
    resetToMatching();
  }, [closeSocket, resetToMatching]);

  // ─── 파생 상태 ───
  const amIPlayer1 = session?.player1_id === player?.id;
  const didIWin =
    session?.round_result &&
    ((amIPlayer1 && session.round_result.winner === 'player1') ||
      (!amIPlayer1 && session.round_result.winner === 'player2'));
  const isDraw = session?.round_result?.winner === 'draw';

  // ═══════════════════════════════════════════
  // UI 렌더링
  // ═══════════════════════════════════════════
  return (
    <div className="mx-auto max-w-lg">
      <AnimatePresence mode="wait">
        {/* ── 상대 이탈 오버레이 ── */}
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

        {/* ── NICKNAME SCREEN ── */}
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

        {/* ── MATCHING SCREEN ── */}
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

        {/* ── PartyKit 미설정 경고 ── */}
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

        {/* ── PartyKit 연결 중 ── */}
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

        {/* ── CHOOSING / WAITING SCREEN ── */}
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

        {/* ── RESULT SCREEN ── */}
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

            {/* 무승부: 자동 재매칭 안내 */}
            {isDraw && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-4"
              >
                <p className="text-sm text-white/40">{t('drawRematch')}</p>
                <div className="mx-auto mt-2 h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-500" />
              </motion.div>
            )}

            {/* 승리 시 연승 표시 */}
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

            {/* 승/패 시 "다시 하기" 버튼 (무승부는 자동 재매칭) */}
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
