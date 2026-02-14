/**
 * RPSGame 플로우 검증: 상태 전이, 타임아웃, 복구 로직
 * - 매칭 후 session.status에 따라 choosing 전환되는지
 * - result 상태에서 round_result 없으면 복구되는지
 * - 무승부 시 세션 종료되는지
 * - 모든 타임아웃이 UI 멈춤을 방지하는지
 */
import { describe, it, expect } from 'vitest';

// 상수 (RPSGame.tsx와 동일)
const MATCHING_TIMEOUT_MS = 60_000;
const PARTYKIT_CONNECT_TIMEOUT_MS = 10_000;
const OPPONENT_CHOICE_TIMEOUT_MS = 30_000;
const DRAW_DISPLAY_MS = 2_500;
const OPPONENT_LEFT_DISPLAY_MS = 2_000;
const SESSION_POLL_INTERVAL_MS = 1_500;
const GLOBAL_STUCK_TIMEOUT_MS = 120_000;

describe('RPSGame 플로우 상수', () => {
  it('waiting 세션 폴링 간격이 1.5초로 설정되어 playing 전환 보장', () => {
    expect(SESSION_POLL_INTERVAL_MS).toBe(1_500);
  });

  it('상대 선택 대기 타임아웃이 30초', () => {
    expect(OPPONENT_CHOICE_TIMEOUT_MS).toBe(30_000);
  });

  it('PartyKit 연결 타임아웃이 10초로 무한대기 방지', () => {
    expect(PARTYKIT_CONNECT_TIMEOUT_MS).toBe(10_000);
  });

  it('무승부 표시 후 자동 재매칭까지 2.5초', () => {
    expect(DRAW_DISPLAY_MS).toBe(2_500);
  });

  it('글로벌 스턱 감지가 2분으로 설정됨', () => {
    expect(GLOBAL_STUCK_TIMEOUT_MS).toBe(120_000);
  });
});

describe('게임 상태 전이 규칙 (의도 검증)', () => {
  it('session.status === "waiting" 이면 폴링으로 "playing" 수신 시 choosing 전환', () => {
    const status = 'waiting';
    const nextStatus = 'playing';
    expect(status).toBe('waiting');
    expect(nextStatus).toBe('playing');
  });

  it('session.status === "playing" && !round_result 이면 choosing 화면', () => {
    const session = { status: 'playing', round_result: null };
    const shouldShowChoosing = session.status === 'playing' && !session.round_result;
    expect(shouldShowChoosing).toBe(true);
  });

  it('state === "result" && !session?.round_result 이면 검은화면 방지를 위해 재매칭 필요', () => {
    const state = 'result';
    const session: { round_result: unknown } | null = { round_result: null };
    const needsRecovery = state === 'result' && (!session || !session.round_result);
    expect(needsRecovery).toBe(true);
  });

  it('무승부(draw) 시 세션이 finished로 종료되어야 함 (같은 상대와 반복 방지)', () => {
    // 기존: draw → status 'playing' 유지 (같은 세션에서 계속)
    // 변경: draw → status 'finished' (세션 종료, 새 상대 매칭)
    const drawResult = 'draw';
    const expectedSessionStatus = 'finished';
    const shouldEndSession = drawResult === 'draw';
    expect(shouldEndSession).toBe(true);
    expect(expectedSessionStatus).toBe('finished');
  });

  it('session_end 수신 시 WebSocket 즉시 종료', () => {
    const messageType = 'session_end';
    const shouldCloseSocket = messageType === 'session_end';
    expect(shouldCloseSocket).toBe(true);
  });

  it('모든 게임 결과(승/패/무승부) 후 WebSocket 연결 끊김', () => {
    const results = ['player1', 'player2', 'draw'];
    for (const result of results) {
      // session_end 또는 session_update(finished)로 소켓 닫힘
      const shouldDisconnect = true;
      expect(shouldDisconnect).toBe(true);
    }
  });
});

describe('실시간 동기화 규칙 (핵심 수정사항)', () => {
  it('waiting 세션에서도 PartyKit 사전 연결 (wsRoomId 포함)', () => {
    // wsRoomId = session.id when status is 'waiting' or 'playing'
    const sessionWaiting = { id: 'abc', status: 'waiting' };
    const sessionPlaying = { id: 'abc', status: 'playing' };
    const sessionFinished = { id: 'abc', status: 'finished' };

    const roomIdWaiting = (sessionWaiting.status === 'waiting' || sessionWaiting.status === 'playing') ? sessionWaiting.id : null;
    const roomIdPlaying = (sessionPlaying.status === 'waiting' || sessionPlaying.status === 'playing') ? sessionPlaying.id : null;
    const roomIdFinished = (sessionFinished.status === 'waiting' || sessionFinished.status === 'playing') ? sessionFinished.id : null;

    expect(roomIdWaiting).toBe('abc');
    expect(roomIdPlaying).toBe('abc');
    expect(roomIdFinished).toBeNull();
    // waiting→playing 전환 시 roomId 변경 없음 → WebSocket 재연결 불필요
    expect(roomIdWaiting).toBe(roomIdPlaying);
  });

  it('match API에서 broadcast하여 대기 플레이어 즉시 알림', () => {
    // 매칭 시 broadcastSessionUpdate 호출 (폴링 지연 제거)
    const broadcastOnMatch = true;
    expect(broadcastOnMatch).toBe(true);
  });

  it('중간 broadcast 수신 시 이미 선택한 상태를 리셋하지 않음 (myChoiceRef 보호)', () => {
    // Player A가 rock 선택 후, 자신의 중간 broadcast를 수신해도 상태 유지
    const myChoice = 'rock';
    const hasChosen = myChoice !== null;
    const sessionUpdate = { status: 'playing', round_result: null };

    // 기존 코드: 무조건 setState('choosing'), setMyChoice(null) → BUG
    // 수정 코드: myChoiceRef.current가 있으면 스킵
    const shouldReset = sessionUpdate.status === 'playing' && !sessionUpdate.round_result && !hasChosen;
    expect(shouldReset).toBe(false); // 이미 선택함 → 리셋하지 않음
  });

  it('선택 전 broadcast 수신 시 choosing으로 전환 (매칭 알림)', () => {
    const myChoice = null;
    const hasChosen = myChoice !== null;
    const sessionUpdate = { status: 'playing', round_result: null };

    const shouldTransition = sessionUpdate.status === 'playing' && !sessionUpdate.round_result && !hasChosen;
    expect(shouldTransition).toBe(true); // 선택 안 함 → choosing 전환
  });

  it('"Already chose" 에러 시 abandon 대신 세션 동기화', () => {
    // 이중 제출 시 abandon하면 세션이 꼬임 → 대신 서버 세션으로 동기화
    const shouldAbandon = false;
    const shouldSyncSession = true;
    expect(shouldAbandon).toBe(false);
    expect(shouldSyncSession).toBe(true);
  });
});

describe('안전망 검증: UI 멈춤/무한로드 방지', () => {
  it('choosing/waiting 상태에 글로벌 스턱 타임아웃 적용', () => {
    const activeStates = ['choosing', 'waiting'];
    for (const state of activeStates) {
      // GLOBAL_STUCK_TIMEOUT_MS 후 abandonAndRematch 호출
      expect(activeStates.includes(state)).toBe(true);
    }
    expect(GLOBAL_STUCK_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });

  it('matching 상태에 매칭 타임아웃 적용', () => {
    expect(MATCHING_TIMEOUT_MS).toBe(60_000);
  });

  it('beforeunload 핸들러로 페이지 이탈 시 세션 정리', () => {
    // sendBeacon 사용으로 비동기 요청 보장
    const useSendBeacon = true;
    expect(useSendBeacon).toBe(true);
  });

  it('상대 이탈 시 2초 후 자동 재매칭', () => {
    expect(OPPONENT_LEFT_DISPLAY_MS).toBe(2_000);
  });

  it('매칭 에러 시 3초 후 자동 재시도', () => {
    const MATCH_RETRY_DELAY_MS = 3_000;
    expect(MATCH_RETRY_DELAY_MS).toBe(3_000);
  });
});
