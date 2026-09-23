import { describe, expect, it } from 'vitest';
import { isStreakBonusDay, streakBlockKey, streakFrom } from './attendance.js';

// PT-09 연속 출석
describe('streakFrom', () => {
  it('오늘부터 거꾸로 이어진 날만 센다', () => {
    const days = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];
    expect(streakFrom(days, '2026-09-24')).toBe(5);
  });

  it('중간에 빠지면 거기서 끊긴다', () => {
    expect(streakFrom(['2026-09-20', '2026-09-22', '2026-09-23', '2026-09-24'], '2026-09-24')).toBe(
      3,
    );
  });

  it('오늘 출석이 없으면 0', () => {
    expect(streakFrom(['2026-09-23'], '2026-09-24')).toBe(0);
  });

  it('월 경계도 이어진다', () => {
    expect(streakFrom(['2026-08-31', '2026-09-01'], '2026-09-01')).toBe(2);
  });
});

describe('보너스', () => {
  it('7·14·21일째만', () => {
    expect(isStreakBonusDay(6)).toBe(false);
    expect(isStreakBonusDay(7)).toBe(true);
    expect(isStreakBonusDay(14)).toBe(true);
    expect(isStreakBonusDay(0)).toBe(false);
  });

  it('구간 시작일 키', () => {
    expect(streakBlockKey('2026-09-24', 7)).toBe('2026-09-18');
  });
});
