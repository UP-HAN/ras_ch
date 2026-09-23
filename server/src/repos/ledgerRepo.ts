/**
 * point_ledger 저장소 (PT-01, 7.5). 합계 컬럼 없이 원장만 집계한다 (절대 규칙 1).
 */
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { CapUsage } from '../lib/pointCaps.js';
import type { CapScope, LedgerRow, PointRuleRow } from '../types/db.js';

export interface UsageQuery {
  ruleCodes: string[];
  scope: CapScope;
  /** user: 받는 사람 기준 / granter: 지급자(교사) 기준 */
  by: 'user' | 'granter';
  subjectId: number;
  dayKey: string;
  weekKey: string;
  monthKey: string;
  objectType: string | null;
  objectId: number | null;
}

export interface NewLedgerRow {
  userId: number;
  ruleCode: string;
  ruleVersion: number;
  amount: number;
  refType: string | null;
  refId: number | null;
  objectType: string | null;
  objectId: number | null;
  dayKey: string;
  weekKey: string;
  note: string | null;
  grantedBy: number | null;
  reversalOf: number | null;
  eventKey: string | null;
}

export type LedgerRowFull = LedgerRow & { object_type: string | null; object_id: number | null };

export async function getRule(
  code: string,
  conn: Executor = getPool(),
): Promise<PointRuleRow | null> {
  return queryOne<PointRuleRow>('SELECT * FROM point_rules WHERE code = ? LIMIT 1', [code], conn);
}

export async function findByEventKey(
  eventKey: string,
  conn: Executor = getPool(),
): Promise<{ id: number; reversed: boolean } | null> {
  const row = await queryOne<{ id: number; reversed: number }>(
    `SELECT l.id, EXISTS(SELECT 1 FROM point_ledger r WHERE r.reversal_of = l.id) AS reversed
     FROM point_ledger l WHERE l.event_key = ? LIMIT 1`,
    [eventKey],
    conn,
  );
  return row ? { id: row.id, reversed: Number(row.reversed) === 1 } : null;
}

/**
 * 상한 집계: count = 회수되지 않은 양수 행 수, points = SUM(amount) (회수 반영 net)
 */
export async function usage(q: UsageQuery, conn: Executor = getPool()): Promise<CapUsage> {
  const where: string[] = [`l.rule_code IN (${q.ruleCodes.map(() => '?').join(',')})`];
  const params: unknown[] = [...q.ruleCodes];
  where.push(q.by === 'granter' ? 'l.granted_by = ?' : 'l.user_id = ?');
  params.push(q.subjectId);
  switch (q.scope) {
    case 'day':
      where.push('l.day_key = ?');
      params.push(q.dayKey);
      break;
    case 'week':
      where.push('l.week_key = ?');
      params.push(q.weekKey);
      break;
    case 'month':
      where.push('l.month_key = ?');
      params.push(q.monthKey);
      break;
    case 'per_object':
    case 'streak':
      where.push('l.object_type <=> ? AND l.object_id <=> ?');
      params.push(q.objectType, q.objectId);
      break;
  }
  const r = await queryOne<{ cnt: number | null; pts: number | null }>(
    `SELECT SUM(CASE WHEN l.amount > 0 AND NOT EXISTS (SELECT 1 FROM point_ledger r WHERE r.reversal_of = l.id) THEN 1 ELSE 0 END) AS cnt,
            COALESCE(SUM(l.amount), 0) AS pts
     FROM point_ledger l WHERE ${where.join(' AND ')}`,
    params,
    conn,
  );
  return { count: Number(r?.cnt ?? 0), points: Number(r?.pts ?? 0) };
}

export async function insertLedger(row: NewLedgerRow, conn: Executor = getPool()): Promise<number> {
  return insert(
    `INSERT INTO point_ledger (user_id, rule_code, rule_version, amount, ref_type, ref_id, object_type, object_id, day_key, week_key, note, granted_by, reversal_of, event_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.userId,
      row.ruleCode,
      row.ruleVersion,
      row.amount,
      row.refType,
      row.refId,
      row.objectType,
      row.objectId,
      row.dayKey,
      row.weekKey,
      row.note,
      row.grantedBy,
      row.reversalOf,
      row.eventKey,
    ],
    conn,
  );
}

/** 회수 대상: ref 로 지급된 양수 행 중 아직 회수되지 않은 것 */
export async function listReversible(
  refType: string,
  refId: number,
  ruleCodes: string[] | undefined,
  conn: Executor = getPool(),
): Promise<LedgerRowFull[]> {
  const params: unknown[] = [refType, refId];
  let codeSql = '';
  if (ruleCodes && ruleCodes.length > 0) {
    codeSql = ` AND l.rule_code IN (${ruleCodes.map(() => '?').join(',')})`;
    params.push(...ruleCodes);
  }
  return query<LedgerRowFull>(
    `SELECT l.* FROM point_ledger l
     WHERE l.ref_type = ? AND l.ref_id = ? AND l.amount > 0 AND l.reversal_of IS NULL${codeSql}
       AND NOT EXISTS (SELECT 1 FROM point_ledger r WHERE r.reversal_of = l.id)
     ORDER BY l.id FOR UPDATE`,
    params,
    conn,
  );
}

// ---------- 조회 (PT-06) ----------

export async function sumFor(
  userId: number,
  where: 'week' | 'month' | 'all',
  key: string,
): Promise<number> {
  const cond = where === 'week' ? 'AND week_key = ?' : where === 'month' ? 'AND month_key = ?' : '';
  const r = await queryOne<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM point_ledger WHERE user_id = ? ${cond}`,
    where === 'all' ? [userId] : [userId, key],
  );
  return Number(r?.total ?? 0);
}

export interface HistoryRow extends LedgerRowFull {
  rule_name: string | null;
  granted_by_name: string | null;
}

export async function history(
  userId: number,
  where: 'week' | 'month' | 'all',
  key: string,
  limit = 100,
): Promise<HistoryRow[]> {
  const cond =
    where === 'week' ? 'AND l.week_key = ?' : where === 'month' ? 'AND l.month_key = ?' : '';
  return query<HistoryRow>(
    `SELECT l.*, pr.name AS rule_name, g.name AS granted_by_name
     FROM point_ledger l LEFT JOIN point_rules pr ON pr.code = l.rule_code LEFT JOIN users g ON g.id = l.granted_by
     WHERE l.user_id = ? ${cond} ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
    where === 'all' ? [userId, limit] : [userId, key, limit],
  );
}

/** 여러 학생의 기간 합계 (대시보드·결산용) */
export async function sumsByUsers(
  userIds: number[],
  weekKey: string,
): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await query<{ user_id: number; total: number }>(
    `SELECT user_id, COALESCE(SUM(amount), 0) AS total FROM point_ledger WHERE week_key = ? AND user_id IN (${userIds.map(() => '?').join(',')}) GROUP BY user_id`,
    [weekKey, ...userIds],
  );
  return new Map(rows.map((r) => [r.user_id, Number(r.total)]));
}

export async function touchRuleVersion(code: string): Promise<void> {
  await execute('UPDATE point_rules SET version = version + 1 WHERE code = ?', [code]);
}
