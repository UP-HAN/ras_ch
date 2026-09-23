import { describe, expect, it } from 'vitest';
import {
  allowedWeekKeys,
  defaultWeekKey,
  diffMinutes,
  diffPercent,
  isAllowedWeekKey,
} from './reportRules.js';

// RPT-01 주차 규칙, RPT-08 변화 계산
describe('대상 주차', () => {
  it('수요일(2026-09-23)에는 이번 주 2026-W39 가 기본, 지난주 W38 도 허용', () => {
    const now = '2026-09-23T10:00:00+09:00';
    expect(allowedWeekKeys(now)).toEqual({ current: '2026-W39', previous: '2026-W38' });
    expect(defaultWeekKey(now)).toBe('2026-W39');
    expect(isAllowedWeekKey('2026-W38', now)).toBe(true);
    expect(isAllowedWeekKey('2026-W37', now)).toBe(false);
  });

  it('월·화요일에는 지난주가 기본값', () => {
    expect(defaultWeekKey('2026-09-21T08:00:00+09:00')).toBe('2026-W38'); // 월
    expect(defaultWeekKey('2026-09-22T08:00:00+09:00')).toBe('2026-W38'); // 화
    expect(defaultWeekKey('2026-09-27T21:00:00+09:00')).toBe('2026-W39'); // 일
  });

  it('연초 경계: 2027-01-04(월)의 지난주는 2026-W53', () => {
    expect(defaultWeekKey('2027-01-04T08:00:00+09:00')).toBe('2026-W53');
  });
});

describe('diff', () => {
  it('분·% 계산', () => {
    expect(diffMinutes(189, 214)).toBe(-25);
    expect(diffPercent(189, 214)).toBe(-12);
    expect(diffMinutes(120, 100)).toBe(20);
    expect(diffPercent(150, 100)).toBe(50);
  });

  it('값이 없거나 지난주 0이면 null', () => {
    expect(diffMinutes(null, 100)).toBeNull();
    expect(diffMinutes(100, null)).toBeNull();
    expect(diffPercent(100, 0)).toBeNull();
  });
});
