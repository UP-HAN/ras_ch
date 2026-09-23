/**
 * 출석·연속 일수 (PT-09) — 순수 함수. 기준일은 Asia/Seoul 00:00 (dayKey)
 */
import { kst } from './time.js';

export const STREAK_BONUS_EVERY = 7;

/** 오늘(todayKey)부터 거꾸로 이어진 출석 일수. 오늘이 없으면 0 */
export function streakFrom(dayKeys: readonly string[], todayKey: string): number {
  const set = new Set(dayKeys);
  let streak = 0;
  let cursor = kst(todayKey);
  while (set.has(cursor.format('YYYY-MM-DD'))) {
    streak += 1;
    cursor = cursor.subtract(1, 'day');
  }
  return streak;
}

/** 7일 연속 보너스 대상인가 (7, 14, 21…일째) */
export function isStreakBonusDay(streak: number): boolean {
  return streak > 0 && streak % STREAK_BONUS_EVERY === 0;
}

/** STREAK_7 의 근거 키: 이번 7일 구간의 시작일 (원장 per_object 상한용) */
export function streakBlockKey(todayKey: string, streak: number): string {
  return kst(todayKey)
    .subtract(streak - 1, 'day')
    .format('YYYY-MM-DD');
}
