import { execute, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

export interface ReadRow {
  id: number;
  user_id: number;
  target_type: string;
  target_id: number;
  opened_at: Date;
  completed_at: Date | null;
}

/** 열람 시작: 처음 열 때만 서버 시각으로 기록 (PT-10) */
export async function openRead(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<void> {
  await execute(
    'INSERT IGNORE INTO post_reads (user_id, target_type, target_id, opened_at) VALUES (?, ?, ?, NOW(3))',
    [userId, targetType, targetId],
  );
}

export async function findRead(
  userId: number,
  targetType: string,
  targetId: number,
  conn: Executor = getPool(),
): Promise<ReadRow | null> {
  return queryOne<ReadRow>(
    'SELECT * FROM post_reads WHERE user_id = ? AND target_type = ? AND target_id = ? LIMIT 1',
    [userId, targetType, targetId],
    conn,
  );
}

export async function completeRead(id: number, conn: Executor = getPool()): Promise<void> {
  await execute(
    'UPDATE post_reads SET completed_at = NOW(3) WHERE id = ? AND completed_at IS NULL',
    [id],
    conn,
  );
}
