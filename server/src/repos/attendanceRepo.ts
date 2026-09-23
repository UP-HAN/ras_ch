import { execute, query, queryOne } from '../db/query.js';

/** 오늘 첫 접속이면 행을 만들고 id 를, 이미 있으면 null */
export async function insertLoginDay(userId: number, dayKey: string): Promise<number | null> {
  const r = await execute('INSERT IGNORE INTO login_days (user_id, day_key) VALUES (?, ?)', [
    userId,
    dayKey,
  ]);
  return r.affectedRows > 0 ? r.insertId : null;
}

export async function recentLoginDays(userId: number, limit = 60): Promise<string[]> {
  const rows = await query<{ day_key: string }>(
    'SELECT day_key FROM login_days WHERE user_id = ? ORDER BY day_key DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map((r) => r.day_key);
}

export async function countLoginDays(userId: number): Promise<number> {
  const r = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM login_days WHERE user_id = ?',
    [userId],
  );
  return Number(r?.n ?? 0);
}
