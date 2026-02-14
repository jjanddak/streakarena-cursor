/**
 * 가위바위보 게임 로직 (테스트 가능한 순수 함수)
 */
export const VALID_CHOICES = ['rock', 'paper', 'scissors'] as const;
export type RPSChoice = (typeof VALID_CHOICES)[number];

export function determineWinner(
  c1: RPSChoice,
  c2: RPSChoice
): 'player1' | 'player2' | 'draw' {
  if (c1 === c2) return 'draw';
  if (
    (c1 === 'rock' && c2 === 'scissors') ||
    (c1 === 'scissors' && c2 === 'paper') ||
    (c1 === 'paper' && c2 === 'rock')
  ) {
    return 'player1';
  }
  return 'player2';
}
