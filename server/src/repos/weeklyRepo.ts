/**
 * weekly_scores / weekly_class_scores 스냅샷 (HOF-01)
 */
import { execute, query, queryOne, tx } from '../db/query.js';

export interface WeeklyScoreRow {
  user_id: number;
  grade: number;
  class_id: number;
  points: number;
  rank_in_grade: number;
  display_name: string;
  name: string;
  student_no: number | null;
  class_name: string;
}

export interface WeeklyClassRow {
  class_id: number;
  class_name: string;
  grade: number;
  member_count: number;
  avg_points: string | number;
  participation_rate: string | number;
}

export async function hasWeek(weekKey: string): Promise<boolean> {
  const r = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM weekly_scores WHERE week_key = ?',
    [weekKey],
  );
  return Number(r?.n ?? 0) > 0;
}

export async function replaceWeek(
  weekKey: string,
  scores: Array<{
    userId: number;
    grade: number;
    classId: number;
    points: number;
    rankInGrade: number;
  }>,
  classes: Array<{
    classId: number;
    grade: number;
    memberCount: number;
    avgPoints: number;
    participationRate: number;
  }>,
): Promise<void> {
  await tx(async (conn) => {
    await execute('DELETE FROM weekly_scores WHERE week_key = ?', [weekKey], conn);
    await execute('DELETE FROM weekly_class_scores WHERE week_key = ?', [weekKey], conn);
    for (const s of scores) {
      await execute(
        'INSERT INTO weekly_scores (week_key, user_id, grade, class_id, points, rank_in_grade) VALUES (?, ?, ?, ?, ?, ?)',
        [weekKey, s.userId, s.grade, s.classId, s.points, s.rankInGrade],
        conn,
      );
    }
    for (const c of classes) {
      await execute(
        'INSERT INTO weekly_class_scores (week_key, class_id, grade, member_count, avg_points, participation_rate) VALUES (?, ?, ?, ?, ?, ?)',
        [
          weekKey,
          c.classId,
          c.grade,
          c.memberCount,
          c.avgPoints.toFixed(2),
          c.participationRate.toFixed(2),
        ],
        conn,
      );
    }
  });
}

export async function listWeekScores(weekKey: string): Promise<WeeklyScoreRow[]> {
  return query<WeeklyScoreRow>(
    `SELECT w.user_id, w.grade, w.class_id, w.points, w.rank_in_grade, u.display_name, u.name, u.student_no, c.name AS class_name
     FROM weekly_scores w JOIN users u ON u.id = w.user_id JOIN classes c ON c.id = w.class_id
     WHERE w.week_key = ? ORDER BY w.grade, w.rank_in_grade, u.display_name`,
    [weekKey],
  );
}

export async function listWeekClasses(weekKey: string): Promise<WeeklyClassRow[]> {
  return query<WeeklyClassRow>(
    `SELECT w.class_id, c.name AS class_name, w.grade, w.member_count, w.avg_points, w.participation_rate
     FROM weekly_class_scores w JOIN classes c ON c.id = w.class_id WHERE w.week_key = ? ORDER BY w.grade, c.class_no`,
    [weekKey],
  );
}

export async function latestWeekKey(): Promise<string | null> {
  const r = await queryOne<{ k: string }>('SELECT MAX(week_key) AS k FROM weekly_class_scores');
  return r?.k ?? null;
}
