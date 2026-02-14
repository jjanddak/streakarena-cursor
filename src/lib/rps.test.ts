import { describe, it, expect } from 'vitest';
import { determineWinner, VALID_CHOICES } from './rps';

describe('determineWinner', () => {
  it('무승부: 같은 선택이면 draw', () => {
    expect(determineWinner('rock', 'rock')).toBe('draw');
    expect(determineWinner('paper', 'paper')).toBe('draw');
    expect(determineWinner('scissors', 'scissors')).toBe('draw');
  });

  it('player1 승리: rock > scissors, scissors > paper, paper > rock', () => {
    expect(determineWinner('rock', 'scissors')).toBe('player1');
    expect(determineWinner('scissors', 'paper')).toBe('player1');
    expect(determineWinner('paper', 'rock')).toBe('player1');
  });

  it('player2 승리: 위의 반대', () => {
    expect(determineWinner('scissors', 'rock')).toBe('player2');
    expect(determineWinner('paper', 'scissors')).toBe('player2');
    expect(determineWinner('rock', 'paper')).toBe('player2');
  });
});

describe('VALID_CHOICES', () => {
  it('세 가지 선택만 허용', () => {
    expect(VALID_CHOICES).toEqual(['rock', 'paper', 'scissors']);
  });
});
