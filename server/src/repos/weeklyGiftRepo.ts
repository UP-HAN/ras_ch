/**
 * weekly_gifts (HOF-01a, 01b): 주간 선물 지급 이력. 취소해도 행은 남긴다(status='cancelled')
 */
import type { PoolConnection } from 'mysql2/promise';
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

export interface WeeklyGiftRow {
  id: number;
  week_key: string;
  user_id: number;
  granted_by: number;
  method: 'top_n' | 'manual';
  status: 'active' | 'cancelled';
  note: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  created_at: Date;
}

export async function listByWeek(
  weekKey: string,
  conn: Executor = getPool(),
): Promise<WeeklyGiftRow[]> {
  return query<WeeklyGiftRow>(
    'SELECT * FROM weekly_gifts WHERE week_key = ? ORDER BY id',
    [weekKey],
    conn,
  );
}

export async function findByWeekUser(
  weekKey: string,
  userId: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<WeeklyGiftRow | null> {
  return queryOne<WeeklyGiftRow>(
    `SELECT * FROM weekly_gifts WHERE week_key = ? AND user_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [weekKey, userId],
    conn,
  );
}

export async function insertGift(
  g: {
    weekKey: string;
    userId: number;
    grantedBy: number;
    method: 'top_n' | 'manual';
    note: string | null;
  },
  conn: PoolConnection,
): Promise<number> {
  return insert(
    "INSERT INTO weekly_gifts (week_key, user_id, granted_by, method, status, note) VALUES (?, ?, ?, ?, 'active', ?)",
    [g.weekKey, g.userId, g.grantedBy, g.method, g.note],
    conn,
  );
}

/** 취소됐던 행 재지급 */
export async function reactivate(
  id: number,
  g: { grantedBy: number; method: 'top_n' | 'manual'; note: string | null },
  conn: PoolConnection,
): Promise<void> {
  await execute(
    "UPDATE weekly_gifts SET status = 'active', granted_by = ?, method = ?, note = ?, cancelled_by = NULL, cancelled_at = NULL WHERE id = ?",
    [g.grantedBy, g.method, g.note, id],
    conn,
  );
}

export async function cancel(id: number, by: number, conn: PoolConnection): Promise<void> {
  await execute(
    "UPDATE weekly_gifts SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(3) WHERE id = ?",
    [by, id],
    conn,
  );
}

export async function giftedUserIds(weekKey: string): Promise<Set<number>> {
  const rows = await query<{ user_id: number }>(
    "SELECT user_id FROM weekly_gifts WHERE week_key = ? AND status = 'active'",
    [weekKey],
  );
  return new Set(rows.map((r) => r.user_id));
}

/** 여러 주차에 걸쳐 선물을 받은 학생 (월간 결산 제외 토글용) */
export async function giftedUserIdsForWeeks(weekKeys: string[]): Promise<Set<number>> {
  if (weekKeys.length === 0) return new Set();
  const rows = await query<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM weekly_gifts WHERE status = 'active' AND week_key IN (${weekKeys.map(() => '?').join(',')})`,
    weekKeys,
  );
  return new Set(rows.map((r) => r.user_id));
}
