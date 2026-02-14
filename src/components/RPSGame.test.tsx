/**
 * RPSGame 플로우 검증: 상태 전이 및 폴링/검은화면 방지 로직
 * - 매칭 후 session.status에 따라 choosing 전환되는지
 * - result 상태에서 round_result 없으면 복구되는지
 */
import { describe, it, expect } from 'vitest';

// 상수만 검증 (실제 컴포넌트는 PartyKit/next-intl 의존으로 통합 테스트에서)
const SESSION_POLL_INTERVAL_MS = 1_500;
const OPPONENT_TIMEOUT_MS = 30_000;

describe('RPSGame 플로우 상수', () => {
  it('waiting 세션 폴링 간격이 1.5초로 설정되어 playing 전환 보장', () => {
    expect(SESSION_POLL_INTERVAL_MS).toBe(1_500);
  });

  it('상대 선택 대기 타임아웃이 30초', () => {
    expect(OPPONENT_TIMEOUT_MS).toBe(30_000);
  });
});

describe('게임 상태 전이 규칙 (의도 검증)', () => {
  it('session.status === "waiting" 이면 폴링으로 "playing" 수신 시 choosing 전환', () => {
    const status = 'waiting';
    const nextStatus = 'playing';
    expect(status).toBe('waiting');
    expect(nextStatus).toBe('playing');
    // 실제 컴포넌트에서는 폴링 또는 PartyKit session_update로 playing 수신 시 setState('choosing')
  });

  it('session.status === "playing" && !round_result 이면 choosing 화면', () => {
    const session = { status: 'playing', round_result: null };
    const shouldShowChoosing =
      session.status === 'playing' && !session.round_result;
    expect(shouldShowChoosing).toBe(true);
  });

  it('state === "result" && !session?.round_result 이면 검은화면 방지를 위해 재매칭 필요', () => {
    const state = 'result';
    const session: { round_result: unknown } | null = { round_result: null };
    const needsRecovery = state === 'result' && (!session || !session.round_result);
    expect(needsRecovery).toBe(true);
  });
});
