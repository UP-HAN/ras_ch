/**
 * 성장률 부문 (HOF-02b, 02c) — 순수 함수
 *  - 성장률 = (이번 달 − 지난달) ÷ 지난달
 *  - 자격: 지난달 ≥ growthMinPrevPoints(30) AND 이번 달 ≥ 학년 중앙값(활성 학생 전원 기준)
 *  - 포인트 상위(선물 대상)에 이미 든 학생 제외, 학년별 N명, 첫 달은 미운영
 *  - 연속 선정 제한: 지난달 성장률 선정자는 넘김
 */
import { assignRanks, compareStudents, selectTop } from './monthlyTop.js';
import type {
  ConsecutiveOverrides,
  GrowthResult,
  PriorWinners,
  RankedStudent,
  SettlementSettings,
  StudentMonthInput,
} from './types.js';

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function growthRateOf(points: number, prevPoints: number): number {
  return Math.round(((points - prevPoints) / prevPoints) * 1000) / 1000;
}

type GrowthRow = StudentMonthInput & { prevPoints: number; growthRate: number };

const compareGrowth = (a: GrowthRow, b: GrowthRow): number =>
  b.growthRate - a.growthRate || compareStudents(a, b);

export function rankGrowth(
  inputs: StudentMonthInput[],
  giftTargets: RankedStudent[],
  settings: Pick<
    SettlementSettings,
    'perGradeGrowthCount' | 'growthMinPrevPoints' | 'isFirstMonth'
  >,
  prior: PriorWinners,
  overrides: ConsecutiveOverrides = { userIds: new Set(), allowClass: false },
): GrowthResult[] {
  if (settings.isFirstMonth) return [];
  const excluded = new Set(giftTargets.filter((g) => g.selected).map((g) => g.userId));
  const out: GrowthResult[] = [];
  const grades = [...new Set(inputs.map((s) => s.grade))].sort((a, b) => a - b);
  for (const grade of grades) {
    const all = inputs.filter((s) => s.grade === grade);
    const med = median(all.map((s) => s.points));
    const rows: GrowthRow[] = all
      .filter(
        (s): s is StudentMonthInput & { prevPoints: number } =>
          s.prevPoints !== null && s.prevPoints >= settings.growthMinPrevPoints,
      )
      .map((s) => ({ ...s, growthRate: growthRateOf(s.points, s.prevPoints) }))
      .filter((s) => s.growthRate > 0)
      .sort((a, b) => compareGrowth(a, b) || a.userId - b.userId);
    const ranks = assignRanks(rows, compareGrowth);
    const ranked = rows.map((r, i) => ({
      ...r,
      rankInGrade: ranks[i] as number,
      eligible: r.points >= med && !excluded.has(r.userId),
    }));
    const picks = selectTop(
      ranked,
      settings.perGradeGrowthCount,
      compareGrowth,
      (uid) => prior.growthUserIds.has(uid) && !overrides.userIds.has(uid),
    );
    ranked.forEach((r, i) => {
      const p = picks[i] as { selected: boolean; skippedReason: string | null };
      out.push({
        userId: r.userId,
        grade: r.grade,
        classId: r.classId,
        points: r.points,
        prevPoints: r.prevPoints,
        growthRate: r.growthRate,
        rankInGrade: r.rankInGrade,
        selected: p.selected,
        skippedReason:
          p.skippedReason ??
          (r.eligible ? null : excluded.has(r.userId) ? 'gift_target' : 'below_median'),
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
