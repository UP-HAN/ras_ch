/**
 * 월간 결산 초안 (HOF-02, 02a, 02b, 02c, 04): 입력 집계 → 산식 → 스냅샷 저장.
 *  - 확정된 달은 다시 만들 수 없다
 *  - 확정 시에도 같은 buildSettlement 를 인원·예외를 바꿔 다시 돌려 저장한다(한 곳의 산식)
 */
import type { PoolConnection } from 'mysql2/promise';
import { tx } from '../../db/query.js';
import { AppError } from '../../lib/apiResponse.js';
import { monthKey as currentMonthKey } from '../../lib/time.js';
import * as settlementRepo from '../../repos/settlementRepo.js';
import { rankAwards } from './awards.js';
import { rankClasses } from './classReward.js';
import { rankGrowth } from './growth.js';
import {
  buildClassInputs,
  loadAwardInputs,
  loadPriorWinners,
  loadSettings,
  loadStudentInputs,
} from './loadInputs.js';
import { rankMonthlyTop } from './monthlyTop.js';
import type {
  AwardCandidate,
  ClassRewardResult,
  ConsecutiveOverrides,
  GrowthResult,
  RankedStudent,
  SettlementSettings,
} from './types.js';

export interface BuiltSettlement {
  monthKey: string;
  settings: SettlementSettings;
  prevSettlementId: number | null;
  ranking: RankedStudent[];
  growth: GrowthResult[];
  classes: ClassRewardResult[];
  awards: AwardCandidate[];
}

export interface BuildOptions {
  perGradeGiftCount?: number;
  perGradeGrowthCount?: number;
  overrides?: ConsecutiveOverrides;
}

export async function buildSettlement(
  monthKey: string,
  opts: BuildOptions = {},
): Promise<BuiltSettlement> {
  const base = await loadSettings(monthKey);
  const settings: SettlementSettings = {
    ...base,
    perGradeGiftCount: opts.perGradeGiftCount ?? base.perGradeGiftCount,
    perGradeGrowthCount: opts.perGradeGrowthCount ?? base.perGradeGrowthCount,
  };
  const overrides = opts.overrides ?? { userIds: new Set<number>(), allowClass: false };
  const students = await loadStudentInputs(monthKey);
  const { prior, prevSettlementId } = await loadPriorWinners(monthKey);
  const ranking = rankMonthlyTop(students, settings.perGradeGiftCount, prior, overrides);
  const growth = rankGrowth(students, ranking, settings, prior, overrides);
  const classes = rankClasses(buildClassInputs(students), prior, overrides.allowClass);
  const awards = rankAwards(await loadAwardInputs(monthKey), 5);
  return { monthKey, settings, prevSettlementId, ranking, growth, classes, awards };
}

/** 스냅샷 저장(초안·확정 공통). awards 는 상태를 유지하려면 keepAwards 로 넘긴다 */
export async function persistSnapshot(
  built: BuiltSettlement,
  conn: PoolConnection,
  awardRows?: settlementRepo.AwardInsert[],
): Promise<number> {
  const winner = built.classes.find((c) => c.isWinner) ?? null;
  const id = await settlementRepo.upsertDraft(
    built.monthKey,
    {
      prevSettlementId: built.prevSettlementId,
      perGradeGiftCount: built.settings.perGradeGiftCount,
      perGradeGrowthCount: built.settings.perGradeGrowthCount,
      winnerClassId: winner?.classId ?? null,
    },
    conn,
  );
  const growthByUser = new Map(built.growth.map((g) => [g.userId, g]));
  const scores: settlementRepo.ScoreInsert[] = built.ranking.map((r) => {
    const g = growthByUser.get(r.userId);
    return {
      userId: r.userId,
      grade: r.grade,
      classId: r.classId,
      points: r.points,
      prevPoints: g?.prevPoints ?? null,
      growthRate: g?.growthRate ?? null,
      rankInGrade: r.rankInGrade,
      isGiftTarget: r.selected,
      isGrowthTarget: g?.selected ?? false,
      skippedReason: r.skippedReason ?? (g?.skippedReason ? `growth:${g.skippedReason}` : null),
      tiebreak: r.tiebreak,
    };
  });
  const classes: settlementRepo.ClassScoreInsert[] = built.classes.map((c) => ({
    classId: c.classId,
    grade: c.grade,
    memberCount: c.memberCount,
    avgPoints: c.avgPoints,
    participationRate: c.participationRate,
    rankOverall: c.rankOverall,
    isWinner: c.isWinner,
    skippedReason: c.skippedReason,
  }));
  const awards: settlementRepo.AwardInsert[] =
    awardRows ??
    built.awards.map((a) => ({
      category: a.category,
      userId: a.userId,
      grade: a.grade,
      score: a.score,
      breakdown: a.breakdown,
      rankInGrade: a.rankInGrade,
      status: 'candidate',
      reason: null,
      confirmedBy: null,
    }));
  await settlementRepo.replaceScores(id, built.monthKey, scores, classes, awards, conn);
  return id;
}

export async function createDraft(monthKey: string): Promise<number> {
  if (monthKey >= currentMonthKey())
    throw AppError.badRequest('이번 달은 아직 끝나지 않았어요. 지난달까지만 결산할 수 있어요.');
  const existing = await settlementRepo.findByMonth(monthKey);
  if (existing?.status === 'confirmed') throw AppError.conflict('이미 확정된 달이에요.');
  const built = await buildSettlement(monthKey);
  return tx((conn) => persistSnapshot(built, conn));
}

/** 조회 시 초안이 없으면(지난달 이전) 만들어 준다 */
export async function ensureDraft(monthKey: string): Promise<settlementRepo.SettlementRow | null> {
  const existing = await settlementRepo.findByMonth(monthKey);
  if (existing) return existing;
  if (monthKey >= currentMonthKey()) return null;
  await createDraft(monthKey);
  return settlementRepo.findByMonth(monthKey);
}
