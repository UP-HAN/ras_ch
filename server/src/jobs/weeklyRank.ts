/**
 * 주간 TOP 순위 계산 (HOF-01) — 순수 함수. 학년별 points 내림차순, 완전 동점은 같은 순위(경쟁 순위)
 */
export interface WeeklyRow {
  userId: number;
  grade: number;
  classId: number;
  points: number;
}

export interface WeeklyRanked extends WeeklyRow {
  rankInGrade: number;
}

export function rankWeekly(rows: WeeklyRow[]): WeeklyRanked[] {
  const out: WeeklyRanked[] = [];
  const grades = [...new Set(rows.map((r) => r.grade))].sort((a, b) => a - b);
  for (const grade of grades) {
    const sorted = rows
      .filter((r) => r.grade === grade)
      .sort((a, b) => b.points - a.points || a.userId - b.userId);
    let rank = 0;
    sorted.forEach((r, i) => {
      const prev = sorted[i - 1];
      if (i === 0 || (prev && prev.points !== r.points)) rank = i + 1;
      out.push({ ...r, rankInGrade: rank });
    });
  }
  return out;
}

/** 학년별 상위 N (같은 순위는 함께 포함) */
export function topPerGrade<T extends { grade: number; rankInGrade: number }>(
  rows: T[],
  n: number,
): T[] {
  return rows.filter((r) => r.rankInGrade <= n);
}
