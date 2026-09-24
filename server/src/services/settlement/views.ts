/**
 * 스냅샷 → 화면 뷰 (HOF-06, ADM-03). 교사 뷰는 실명, 학생 뷰는 마스킹 이름만 (절대 규칙 4)
 */
import { CATEGORY_LABEL } from './awards.js';
import * as settlementRepo from '../../repos/settlementRepo.js';
import * as weeklyGiftRepo from '../../repos/weeklyGiftRepo.js';
import { weekKeysInMonth } from '../../lib/weeklyGift.js';
import type {
  AwardCandidateView,
  HallAward,
  HallClassRow,
  HallStudent,
  SettlementClassRow,
  SettlementGrowthRow,
  SettlementRankRow,
  SettlementView,
} from '../../types/api.js';

const num = (v: string | number | null) => (v === null ? 0 : Number(v));

export function toHallStudent(
  r: {
    user_id: number;
    display_name: string;
    class_name: string;
    grade: number;
    name: string;
    student_no: number | null;
  },
  teacher: boolean,
  extra?: { rank?: number; points?: number },
): HallStudent {
  const base: HallStudent = {
    userId: r.user_id,
    displayName: r.display_name,
    className: r.class_name,
    grade: r.grade,
  };
  if (!teacher) return base;
  return { ...base, name: r.name, studentNo: r.student_no, ...extra };
}

export function toHallClass(
  c:
    | settlementRepo.ClassScoreRow
    | {
        class_id: number;
        class_name: string;
        grade: number;
        member_count: number;
        avg_points: string | number;
        participation_rate: string | number;
      },
): HallClassRow {
  return {
    classId: c.class_id,
    className: c.class_name,
    grade: c.grade,
    memberCount: c.member_count,
    avgPoints: num(c.avg_points),
    participationRate: num(c.participation_rate),
  };
}

export function toHallAward(a: settlementRepo.AwardRow, teacher: boolean): HallAward {
  return {
    category: a.category,
    label: CATEGORY_LABEL[a.category],
    grade: a.grade,
    student: toHallStudent(
      {
        user_id: a.user_id,
        display_name: a.display_name,
        class_name: a.class_name ?? '',
        grade: a.grade,
        name: a.name,
        student_no: a.student_no,
      },
      teacher,
    ),
    reason: a.reason,
  };
}

function toRankRow(r: settlementRepo.ScoreRow, gifted: Set<number> = new Set()): SettlementRankRow {
  return {
    receivedWeeklyGift: gifted.has(r.user_id),
    userId: r.user_id,
    name: r.name,
    displayName: r.display_name,
    className: r.class_name,
    studentNo: r.student_no,
    points: r.points,
    rank: r.rank_in_grade,
    selected: r.is_gift_target === 1,
    skippedReason:
      r.skipped_reason && !r.skipped_reason.startsWith('growth:') ? r.skipped_reason : null,
    tiebreak: r.tiebreak,
  };
}

/** 성장률 목록: growth_rate 있는 학생을 성장률 내림차순으로, 순위는 즉석 계산 */
function toGrowthRows(rows: settlementRepo.ScoreRow[], gifted: Set<number>): SettlementGrowthRow[] {
  const list = rows
    .filter((r) => r.growth_rate !== null)
    .sort((a, b) => num(b.growth_rate) - num(a.growth_rate) || b.points - a.points);
  return list.map((r, i) => ({
    ...toRankRow(r, gifted),
    rank: i + 1,
    selected: r.is_growth_target === 1,
    skippedReason: r.skipped_reason?.startsWith('growth:') ? r.skipped_reason.slice(7) : null,
    prevPoints: r.prev_points ?? 0,
    growthRate: num(r.growth_rate),
  }));
}

export function toCandidateView(a: settlementRepo.AwardRow): AwardCandidateView {
  return {
    category: a.category,
    userId: a.user_id,
    name: a.name,
    className: a.class_name ?? '',
    studentNo: a.student_no,
    score: num(a.score),
    breakdown: a.score_breakdown ?? {},
    rank: a.rank_in_grade,
    warnings: [],
    status: a.status,
    reason: a.reason,
  };
}

export async function settlementView(
  monthKey: string,
  row: settlementRepo.SettlementRow | null,
): Promise<SettlementView> {
  if (!row) {
    return {
      monthKey,
      id: null,
      status: 'none',
      perGradeGiftCount: 5,
      perGradeGrowthCount: 3,
      excludeWeeklyGift: false,
      isFirstMonth: true,
      draftedAt: null,
      confirmedAt: null,
      confirmedByName: null,
      note: null,
      grades: [],
      classes: [],
      giftCount: 0,
      warnings: [],
    };
  }
  const scores = await settlementRepo.listScores(row.id);
  const classes = await settlementRepo.listClassScores(row.id);
  const awards = await settlementRepo.listAwards(monthKey);
  const gifted = await weeklyGiftRepo.giftedUserIdsForWeeks(weekKeysInMonth(monthKey));
  // HOF-08: 같은 학생이 여러 부문 후보/선정
  const byUser = new Map<number, settlementRepo.AwardRow[]>();
  for (const a of awards)
    if (a.category !== 'growth') byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  const warnings: string[] = [];
  for (const list of byUser.values()) {
    const selected = list.filter((a) => a.status === 'selected');
    if (selected.length >= 2)
      warnings.push(
        `${selected[0]?.name} 학생이 ${selected.map((a) => CATEGORY_LABEL[a.category]).join('·')} 두 부문 이상에 선정됐어요 (분산 권장)`,
      );
  }
  const grades = [...new Set(scores.map((s) => s.grade))].sort((a, b) => a - b);
  return {
    monthKey,
    id: row.id,
    status: row.status,
    perGradeGiftCount: row.per_grade_gift_count,
    perGradeGrowthCount: row.per_grade_growth_count,
    excludeWeeklyGift: row.exclude_weekly_gift === 1,
    isFirstMonth: scores.every((s) => s.growth_rate === null && s.prev_points === null),
    draftedAt: row.drafted_at ? row.drafted_at.toISOString() : null,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    confirmedByName: await settlementRepo.confirmedByName(row.confirmed_by),
    note: row.note,
    grades: grades.map((grade) => {
      const gs = scores.filter((s) => s.grade === grade);
      const ga = awards.filter((a) => a.grade === grade && a.category !== 'growth');
      const withWarnings = (category: 'phonefree' | 'reporter' | 'participation') =>
        ga
          .filter((a) => a.category === category)
          .map((a) => {
            const v = toCandidateView(a);
            const others = (byUser.get(a.user_id) ?? []).filter((o) => o.category !== category);
            if (others.length)
              v.warnings.push(
                `${others.map((o) => CATEGORY_LABEL[o.category]).join(', ')} 후보이기도 해요 (분산 선정 권장)`,
              );
            return v;
          });
      return {
        grade,
        ranking: gs.map((s) => toRankRow(s, gifted)),
        growth: toGrowthRows(gs, gifted),
        awards: {
          phonefree: withWarnings('phonefree'),
          reporter: withWarnings('reporter'),
          participation: withWarnings('participation'),
        },
      };
    }),
    classes: classes.map<SettlementClassRow>((c) => ({
      ...toHallClass(c),
      rank: c.rank_overall,
      isWinner: c.is_winner === 1,
      skippedReason: c.skipped_reason,
    })),
    giftCount: scores.filter((s) => s.is_gift_target === 1).length,
    warnings,
  };
}
