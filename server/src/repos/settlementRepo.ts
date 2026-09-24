/**
 * monthly_settlements / monthly_scores / monthly_class_scores / monthly_awards 스냅샷 (HOF-02~05)
 */
import type { PoolConnection } from 'mysql2/promise';
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

export interface SettlementRow {
  id: number;
  month_key: string;
  status: 'draft' | 'confirmed';
  prev_settlement_id: number | null;
  per_grade_gift_count: number;
  per_grade_growth_count: number;
  winner_class_id: number | null;
  exclude_weekly_gift: 0 | 1;
  drafted_at: Date | null;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  note: string | null;
}

export async function findByMonth(
  monthKey: string,
  conn: Executor = getPool(),
): Promise<SettlementRow | null> {
  return queryOne<SettlementRow>(
    'SELECT * FROM monthly_settlements WHERE month_key = ?',
    [monthKey],
    conn,
  );
}

export async function listConfirmed(): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    "SELECT * FROM monthly_settlements WHERE status = 'confirmed' ORDER BY month_key DESC",
  );
}

export async function upsertDraft(
  monthKey: string,
  v: {
    prevSettlementId: number | null;
    perGradeGiftCount: number;
    perGradeGrowthCount: number;
    winnerClassId: number | null;
    excludeWeeklyGift?: boolean;
  },
  conn: PoolConnection,
): Promise<number> {
  const existing = await findByMonth(monthKey, conn);
  const exclude = v.excludeWeeklyGift ? 1 : 0;
  if (existing) {
    await execute(
      `UPDATE monthly_settlements SET prev_settlement_id = ?, per_grade_gift_count = ?, per_grade_growth_count = ?, winner_class_id = ?, exclude_weekly_gift = ?, drafted_at = NOW(3) WHERE id = ?`,
      [
        v.prevSettlementId,
        v.perGradeGiftCount,
        v.perGradeGrowthCount,
        v.winnerClassId,
        exclude,
        existing.id,
      ],
      conn,
    );
    return existing.id;
  }
  return insert(
    `INSERT INTO monthly_settlements (month_key, status, prev_settlement_id, per_grade_gift_count, per_grade_growth_count, winner_class_id, exclude_weekly_gift, drafted_at)
     VALUES (?, 'draft', ?, ?, ?, ?, ?, NOW(3))`,
    [
      monthKey,
      v.prevSettlementId,
      v.perGradeGiftCount,
      v.perGradeGrowthCount,
      v.winnerClassId,
      exclude,
    ],
    conn,
  );
}

export interface ScoreInsert {
  userId: number;
  grade: number;
  classId: number;
  points: number;
  prevPoints: number | null;
  growthRate: number | null;
  rankInGrade: number;
  isGiftTarget: boolean;
  isGrowthTarget: boolean;
  skippedReason: string | null;
  tiebreak: { reportCount: number; articleCount: number; activeDays: number };
}

export interface ClassScoreInsert {
  classId: number;
  grade: number;
  memberCount: number;
  avgPoints: number;
  participationRate: number;
  rankOverall: number;
  isWinner: boolean;
  skippedReason: string | null;
}

export interface AwardInsert {
  category: 'phonefree' | 'reporter' | 'participation' | 'growth';
  userId: number;
  grade: number;
  score: number;
  breakdown: Record<string, number> | null;
  rankInGrade: number;
  status: 'candidate' | 'selected' | 'skipped';
  reason: string | null;
  confirmedBy: number | null;
}

export async function replaceScores(
  settlementId: number,
  monthKey: string,
  scores: ScoreInsert[],
  classes: ClassScoreInsert[],
  awards: AwardInsert[],
  conn: PoolConnection,
): Promise<void> {
  await execute('DELETE FROM monthly_scores WHERE settlement_id = ?', [settlementId], conn);
  await execute('DELETE FROM monthly_class_scores WHERE settlement_id = ?', [settlementId], conn);
  await execute('DELETE FROM monthly_awards WHERE month_key = ?', [monthKey], conn);
  for (const s of scores) {
    await execute(
      `INSERT INTO monthly_scores (settlement_id, user_id, grade, class_id, points, prev_points, growth_rate, rank_in_grade, is_gift_target, is_growth_target, skipped_reason, tiebreak)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementId,
        s.userId,
        s.grade,
        s.classId,
        s.points,
        s.prevPoints,
        s.growthRate,
        s.rankInGrade,
        s.isGiftTarget ? 1 : 0,
        s.isGrowthTarget ? 1 : 0,
        s.skippedReason,
        JSON.stringify(s.tiebreak),
      ],
      conn,
    );
  }
  for (const c of classes) {
    await execute(
      `INSERT INTO monthly_class_scores (settlement_id, class_id, grade, member_count, avg_points, participation_rate, rank_overall, is_winner, skipped_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementId,
        c.classId,
        c.grade,
        c.memberCount,
        c.avgPoints.toFixed(2),
        c.participationRate.toFixed(2),
        c.rankOverall,
        c.isWinner ? 1 : 0,
        c.skippedReason,
      ],
      conn,
    );
  }
  for (const a of awards) {
    await execute(
      `INSERT INTO monthly_awards (month_key, category, user_id, grade, score, score_breakdown, rank_in_grade, status, reason, confirmed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        monthKey,
        a.category,
        a.userId,
        a.grade,
        a.score.toFixed(2),
        a.breakdown ? JSON.stringify(a.breakdown) : null,
        a.rankInGrade,
        a.status,
        a.reason,
        a.confirmedBy,
      ],
      conn,
    );
  }
}

export async function markConfirmed(
  id: number,
  v: {
    confirmedBy: number;
    note: string | null;
    perGradeGiftCount: number;
    perGradeGrowthCount: number;
    winnerClassId: number | null;
  },
  conn: PoolConnection,
): Promise<void> {
  await execute(
    `UPDATE monthly_settlements SET status = 'confirmed', confirmed_by = ?, confirmed_at = NOW(3), note = ?, per_grade_gift_count = ?, per_grade_growth_count = ?, winner_class_id = ? WHERE id = ?`,
    [v.confirmedBy, v.note, v.perGradeGiftCount, v.perGradeGrowthCount, v.winnerClassId, id],
    conn,
  );
}

export interface ScoreRow {
  user_id: number;
  grade: number;
  class_id: number;
  points: number;
  prev_points: number | null;
  growth_rate: string | number | null;
  rank_in_grade: number;
  is_gift_target: 0 | 1;
  is_growth_target: 0 | 1;
  skipped_reason: string | null;
  tiebreak: { reportCount: number; articleCount: number; activeDays: number } | null;
  name: string;
  display_name: string;
  student_no: number | null;
  class_name: string;
}

export async function listScores(settlementId: number): Promise<ScoreRow[]> {
  return query<ScoreRow>(
    `SELECT m.*, u.name, u.display_name, u.student_no, c.name AS class_name
     FROM monthly_scores m JOIN users u ON u.id = m.user_id JOIN classes c ON c.id = m.class_id
     WHERE m.settlement_id = ? ORDER BY m.grade, m.rank_in_grade, u.display_name`,
    [settlementId],
  );
}

export interface ClassScoreRow {
  class_id: number;
  class_name: string;
  grade: number;
  member_count: number;
  avg_points: string | number;
  participation_rate: string | number;
  rank_overall: number;
  is_winner: 0 | 1;
  skipped_reason: string | null;
}

export async function listClassScores(settlementId: number): Promise<ClassScoreRow[]> {
  return query<ClassScoreRow>(
    `SELECT m.class_id, c.name AS class_name, m.grade, m.member_count, m.avg_points, m.participation_rate, m.rank_overall, m.is_winner, m.skipped_reason
     FROM monthly_class_scores m JOIN classes c ON c.id = m.class_id WHERE m.settlement_id = ? ORDER BY m.rank_overall`,
    [settlementId],
  );
}

export interface AwardRow {
  id: number;
  category: 'phonefree' | 'reporter' | 'participation' | 'growth';
  user_id: number;
  grade: number;
  score: string | number;
  score_breakdown: Record<string, number> | null;
  rank_in_grade: number;
  status: 'candidate' | 'selected' | 'skipped';
  reason: string | null;
  name: string;
  display_name: string;
  student_no: number | null;
  class_name: string;
}

export async function listAwards(monthKey: string): Promise<AwardRow[]> {
  return query<AwardRow>(
    `SELECT a.*, u.name, u.display_name, u.student_no, c.name AS class_name
     FROM monthly_awards a JOIN users u ON u.id = a.user_id LEFT JOIN classes c ON c.id = u.class_id
     WHERE a.month_key = ? ORDER BY a.category, a.grade, a.rank_in_grade`,
    [monthKey],
  );
}

export async function confirmedByName(id: number | null): Promise<string | null> {
  if (!id) return null;
  const r = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [id]);
  return r?.name ?? null;
}
