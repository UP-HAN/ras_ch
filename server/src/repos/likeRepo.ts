import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

export interface LikeRow {
  id: number;
  user_id: number;
  target_type: string;
  target_id: number;
  created_at: Date;
}

export async function findLike(
  userId: number,
  targetType: string,
  targetId: number,
  conn: Executor = getPool(),
): Promise<LikeRow | null> {
  return queryOne<LikeRow>(
    'SELECT * FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ? LIMIT 1',
    [userId, targetType, targetId],
    conn,
  );
}

export async function insertLike(
  userId: number,
  targetType: string,
  targetId: number,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)',
    [userId, targetType, targetId],
    conn,
  );
}

export async function deleteLike(id: number, conn: Executor = getPool()): Promise<void> {
  await execute('DELETE FROM likes WHERE id = ?', [id], conn);
}

export async function bumpPostLikes(
  postId: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<number> {
  await execute(
    'UPDATE posts SET like_count = GREATEST(0, like_count + ?) WHERE id = ?',
    [delta, postId],
    conn,
  );
  const r = await queryOne<{ like_count: number }>(
    'SELECT like_count FROM posts WHERE id = ?',
    [postId],
    conn,
  );
  return Number(r?.like_count ?? 0);
}

/** 내가 좋아요한 대상 id 집합 (목록·상세에서 버튼 상태 표시용) */
export async function likedTargetIds(
  userId: number,
  targetType: string,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await query<{ target_id: number }>(
    `SELECT target_id FROM likes WHERE user_id = ? AND target_type = ? AND target_id IN (${ids.map(() => '?').join(',')})`,
    [userId, targetType, ...ids],
  );
  return new Set(rows.map((r) => r.target_id));
}
