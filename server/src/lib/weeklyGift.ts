import { weekKey as currentWeekKey, weekRange } from './time.js';

/**
 * 주간 선물 대상 선택 (HOF-01a) — 순수 함수: 학년별 상위 N(동점 포함, 0P 제외) ∪ 개별 선택
 */
export interface WeeklyCandidate {
  userId: number;
  grade: number;
  points: number;
  rankInGrade: number;
}

export function selectGiftTargets(
  rows: WeeklyCandidate[],
  topN: number,
  manualIds: number[] = [],
): { userId: number; method: 'top_n' | 'manual' }[] {
  const out = new Map<number, 'top_n' | 'manual'>();
  if (topN > 0) {
    for (const r of rows) if (r.points > 0 && r.rankInGrade <= topN) out.set(r.userId, 'top_n');
  }
  const known = new Set(rows.map((r) => r.userId));
  for (const id of manualIds) if (known.has(id) && !out.has(id)) out.set(id, 'manual');
  return [...out.entries()].map(([userId, method]) => ({ userId, method }));
}

/** 결산 제외 토글용: 이 달(주차 월요일 기준)에 선물 받은 학생 */
export function weekKeysInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  const keys: string[] = [];
  const first = weekRange(currentWeekKey(new Date(Date.UTC(y, m - 1, 1, 3)))).start;
  let cursor = first;
  for (let i = 0; i < 6; i += 1) {
    if (cursor.year() === y && cursor.month() + 1 === m) keys.push(currentWeekKey(cursor));
    cursor = cursor.add(1, 'week');
  }
  return keys;
}
