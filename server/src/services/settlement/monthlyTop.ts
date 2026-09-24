/**
 * 월간 포인트 상위 (HOF-02, 02c, 03) — 순수 함수
 *  - 학년별 points 내림차순, 동점은 리포트 게시 > 기사 게시 > 활동 일수 순, 그래도 같으면 공동 선정
 *  - 순위는 경쟁 순위(1,1,3)
 *  - 지난달 선정자는 연속 선정 제한으로 다음 순위에 넘기고 skippedReason='consecutive'
 *    (승인 교사가 예외 허용하면 overrides.userIds 로 통과)
 *  - 0P 학생은 선정하지 않는다
 */
import type {
  ConsecutiveOverrides,
  PriorWinners,
  RankedStudent,
  StudentMonthInput,
} from './types.js';

export const SKIP_CONSECUTIVE = 'consecutive';
/** HOF-01b: 주간 선물 수령자 제외 토글로 넘긴 사유 */
export const SKIP_WEEKLY_GIFT = 'weekly_gift';

type Tiebreakable = Pick<
  StudentMonthInput,
  'points' | 'reportCount' | 'articleCount' | 'activeDays'
>;

/** 내림차순 비교. 0 이면 완전 동점(공동 선정) */
export function compareStudents(a: Tiebreakable, b: Tiebreakable): number {
  return (
    b.points - a.points ||
    b.reportCount - a.reportCount ||
    b.articleCount - a.articleCount ||
    b.activeDays - a.activeDays
  );
}

/** 경쟁 순위 부여(정렬된 배열 기준). 완전 동점은 같은 순위 */
export function assignRanks<T>(sorted: T[], compare: (a: T, b: T) => number): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    ranks.push(
      i > 0 && prev !== undefined && compare(prev, sorted[i] as T) === 0
        ? (ranks[i - 1] as number)
        : i + 1,
    );
  }
  return ranks;
}

/**
 * 정렬·순위가 매겨진 후보 목록에서 N명 선정. 동점자는 함께 선정(공동), 연속 제한 대상은 넘긴다.
 * eligible=false 인 항목은 순위는 갖되 선정 대상이 아니다.
 */
export function selectTop<T extends { userId: number; eligible: boolean }>(
  sortedWithRank: Array<T & { rankInGrade: number }>,
  count: number,
  compare: (a: NoInfer<T>, b: NoInfer<T>) => number,
  isConsecutive: (userId: number) => boolean,
): Array<{ selected: boolean; skippedReason: string | null }> {
  const out: Array<{ selected: boolean; skippedReason: string | null }> = [];
  let selectedCount = 0;
  let lastSelected: T | null = null;
  for (const row of sortedWithRank) {
    if (!row.eligible) {
      out.push({ selected: false, skippedReason: null });
      continue;
    }
    if (isConsecutive(row.userId)) {
      out.push({ selected: false, skippedReason: SKIP_CONSECUTIVE });
      continue;
    }
    const tiedWithLast = lastSelected !== null && compare(lastSelected, row) === 0;
    if (selectedCount < count || tiedWithLast) {
      out.push({ selected: true, skippedReason: null });
      selectedCount += 1;
      lastSelected = row;
    } else {
      out.push({ selected: false, skippedReason: null });
    }
  }
  return out;
}

export function rankMonthlyTop(
  inputs: StudentMonthInput[],
  perGradeGiftCount: number,
  prior: PriorWinners,
  overrides: ConsecutiveOverrides = { userIds: new Set(), allowClass: false },
  excludeWeeklyGift = false,
): RankedStudent[] {
  const out: RankedStudent[] = [];
  const grades = [...new Set(inputs.map((s) => s.grade))].sort((a, b) => a - b);
  for (const grade of grades) {
    const sorted = inputs
      .filter((s) => s.grade === grade)
      .sort((a, b) => compareStudents(a, b) || a.userId - b.userId);
    const ranks = assignRanks(sorted, compareStudents);
    const rows = sorted.map((s, i) => ({
      ...s,
      rankInGrade: ranks[i] as number,
      excludedByGift: excludeWeeklyGift && s.receivedWeeklyGift && s.points > 0,
      eligible: s.points > 0 && !(excludeWeeklyGift && s.receivedWeeklyGift),
    }));
    const picks = selectTop(
      rows,
      perGradeGiftCount,
      compareStudents,
      (uid) => prior.giftUserIds.has(uid) && !overrides.userIds.has(uid),
    );
    rows.forEach((r, i) => {
      const p = picks[i] as { selected: boolean; skippedReason: string | null };
      out.push({
        userId: r.userId,
        grade: r.grade,
        classId: r.classId,
        points: r.points,
        rankInGrade: r.rankInGrade,
        selected: p.selected,
        skippedReason: r.excludedByGift ? SKIP_WEEKLY_GIFT : p.skippedReason,
        tiebreak: {
          reportCount: r.reportCount,
          articleCount: r.articleCount,
          activeDays: r.activeDays,
        },
      });
    });
  }
  return out;
}
