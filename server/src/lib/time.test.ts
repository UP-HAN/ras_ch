import { describe, expect, it } from 'vitest';
import {
  dayKey,
  isWeekKey,
  monthKey,
  previousMonthKey,
  previousWeekKey,
  weekKey,
  weekRange,
} from './time.js';

// 절대 규칙 7: Asia/Seoul, ISO 8601 주차(월요일 시작)
describe('weekKey — ISO 주차, 연말·연초 경계', () => {
  it('2026-01-01(목)은 2026-W01', () => {
    expect(weekKey('2026-01-01T09:00:00+09:00')).toBe('2026-W01');
  });

  it('2025-12-29(월)은 2026-W01 (새해 첫 주가 전년도 12월에서 시작)', () => {
    expect(weekKey('2025-12-29T09:00:00+09:00')).toBe('2026-W01');
  });

  it('2026년은 53주: 2026-12-31(목)은 2026-W53', () => {
    expect(weekKey('2026-12-31T09:00:00+09:00')).toBe('2026-W53');
  });

  it('2027-01-03(일)은 아직 2026-W53, 2027-01-04(월)부터 2027-W01', () => {
    expect(weekKey('2027-01-03T09:00:00+09:00')).toBe('2026-W53');
    expect(weekKey('2027-01-04T09:00:00+09:00')).toBe('2027-W01');
  });

  it('2024-12-30(월)은 2025-W01', () => {
    expect(weekKey('2024-12-30T09:00:00+09:00')).toBe('2025-W01');
  });

  it('UTC 일요일 밤은 KST 월요일 새벽 → 다음 주차', () => {
    // 2026-09-20 15:30Z = 2026-09-21 00:30 KST (월)
    expect(weekKey('2026-09-20T15:30:00Z')).toBe('2026-W39');
    // 2026-09-20 14:30Z = 2026-09-20 23:30 KST (일)
    expect(weekKey('2026-09-20T14:30:00Z')).toBe('2026-W38');
  });

  it('형식 검사', () => {
    expect(isWeekKey('2026-W38')).toBe(true);
    expect(isWeekKey('2026-38')).toBe(false);
  });
});

describe('weekRange / previousWeekKey', () => {
  it('2026-W01의 범위는 2025-12-29(월) 00:00 ~ 2026-01-05(월) 00:00', () => {
    const { start, end } = weekRange('2026-W01');
    expect(start.format('YYYY-MM-DD HH:mm')).toBe('2025-12-29 00:00');
    expect(end.format('YYYY-MM-DD HH:mm')).toBe('2026-01-05 00:00');
  });

  it('2026-W38의 시작은 2026-09-14(월)', () => {
    expect(weekRange('2026-W38').start.format('YYYY-MM-DD')).toBe('2026-09-14');
  });

  it('지난주 키: 2027-W01 → 2026-W53, 2026-W01 → 2025-W52', () => {
    expect(previousWeekKey('2027-W01')).toBe('2026-W53');
    expect(previousWeekKey('2026-W01')).toBe('2025-W52');
  });

  it('잘못된 키는 예외', () => {
    expect(() => weekRange('2026-38')).toThrow();
  });
});

describe('dayKey / monthKey', () => {
  it('KST 기준 날짜 (UTC 자정 전후)', () => {
    // 2026-09-22 15:00Z = 2026-09-23 00:00 KST
    expect(dayKey('2026-09-22T15:00:00Z')).toBe('2026-09-23');
    expect(dayKey('2026-09-22T14:59:59Z')).toBe('2026-09-22');
    expect(monthKey('2026-09-30T15:00:00Z')).toBe('2026-10');
  });

  it('지난달 키', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12');
    expect(previousMonthKey('2026-03')).toBe('2026-02');
  });
});
