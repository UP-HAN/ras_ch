/**
 * comments 저장소 — target_type/target_id 로 일반화 (8.1). S3 에서는 'post' 만 쓴다.
 */
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { ClassRow, CommentRow, UserRow } from '../types/db.js';

export type CommentStatus = 'visible' | 'hidden' | 'deleted';

export interface CommentBundle {
  comment: CommentRow & { status: CommentStatus; deleted_at: Date | null };
  author: Pick<
    UserRow,
    'id' | 'name' | 'display_name' | 'class_id' | 'student_no' | 'tier' | 'is_reporter'
  >;
  authorClass: Pick<ClassRow, 'id' | 'name' | 'grade'> | null;
}

type Row = CommentBundle['comment'] & {
  a_id: number;
  a_name: string;
  a_display_name: string;
  a_class_id: number | null;
  a_student_no: number | null;
  a_tier: UserRow['tier'];
  a_is_reporter: 0 | 1;
  c_id: number | null;
  c_name: string | null;
  c_grade: number | null;
};

const SELECT = `
  SELECT c.*, u.id AS a_id, u.name AS a_name, u.display_name AS a_display_name, u.class_id AS a_class_id,
         u.student_no AS a_student_no, u.tier AS a_tier, u.is_reporter AS a_is_reporter,
         k.id AS c_id, k.name AS c_name, k.grade AS c_grade
  FROM comments c JOIN users u ON u.id = c.author_id LEFT JOIN classes k ON k.id = u.class_id`;

function toBundle(r: Row): CommentBundle {
  const {
    a_id,
    a_name,
    a_display_name,
    a_class_id,
    a_student_no,
    a_tier,
    a_is_reporter,
    c_id,
    c_name,
    c_grade,
    ...comment
  } = r;
  return {
    comment: comment as CommentBundle['comment'],
    author: {
      id: a_id,
      name: a_name,
      display_name: a_display_name,
      class_id: a_class_id,
      student_no: a_student_no,
      tier: a_tier,
      is_reporter: a_is_reporter,
    },
    authorClass:
      c_id !== null ? { id: c_id, name: c_name as string, grade: c_grade as number } : null,
  };
}

export async function insertComment(
  targetType: string,
  targetId: number,
  authorId: number,
  body: string,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO comments (target_type, target_id, author_id, body) VALUES (?, ?, ?, ?)',
    [targetType, targetId, authorId, body],
    conn,
  );
}

export async function findComment(
  id: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<CommentBundle | null> {
  const rows = await query<Row>(
    `${SELECT} WHERE c.id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
    conn,
  );
  return rows[0] ? toBundle(rows[0]) : null;
}

export async function listVisibleByTarget(
  targetType: string,
  targetId: number,
  limit = 200,
): Promise<CommentBundle[]> {
  const rows = await query<Row>(
    `${SELECT} WHERE c.target_type = ? AND c.target_id = ? AND c.status = 'visible' ORDER BY c.created_at ASC, c.id ASC LIMIT ?`,
    [targetType, targetId, limit],
  );
  return rows.map(toBundle);
}

/** 게시글당 1인 댓글 수(삭제 제외) — RCT-02 3개 제한 */
export async function countByAuthorTarget(
  authorId: number,
  targetType: string,
  targetId: number,
  conn: Executor = getPool(),
): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM comments WHERE author_id = ? AND target_type = ? AND target_id = ? AND status <> 'deleted'",
    [authorId, targetType, targetId],
    conn,
  );
  return Number(r?.n ?? 0);
}

export async function setCommentStatus(
  id: number,
  status: CommentStatus,
  hiddenBy: number | null,
  reason: string | null,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    `UPDATE comments SET status = ?, hidden_by = ?, hidden_reason = ?, deleted_at = IF(? = 'deleted', NOW(3), deleted_at) WHERE id = ?`,
    [status, hiddenBy, reason, status, id],
    conn,
  );
}

export async function bumpCommentLikes(
  id: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE comments SET like_count = GREATEST(0, like_count + ?) WHERE id = ?',
    [delta, id],
    conn,
  );
}

// ---------- 교사 댓글 모아보기 (TCH-06, 07) ----------

export interface TeacherCommentRow extends Row {
  report_count: number;
  p_id: number | null;
  p_type: string | null;
  p_title: string | null;
  p_body: string | null;
  p_author_display: string | null;
}

export interface TeacherCommentQuery {
  classIds: number[];
  since?: string;
  flag?: 'reported' | 'all';
  beforeId?: number;
  limit: number;
}

export async function listCommentsForTeacher(q: TeacherCommentQuery): Promise<TeacherCommentRow[]> {
  if (q.classIds.length === 0) return [];
  const where: string[] = [
    `u.class_id IN (${q.classIds.map(() => '?').join(',')})`,
    "c.status <> 'deleted'",
  ];
  const params: unknown[] = [...q.classIds];
  if (q.since) {
    where.push('c.created_at >= ?');
    params.push(q.since);
  }
  if (q.beforeId) {
    where.push('c.id < ?');
    params.push(q.beforeId);
  }
  const reportCountSql = `(SELECT COUNT(DISTINCT r.reporter_id) FROM reports r WHERE r.target_type = 'comment' AND r.target_id = c.id AND r.status = 'open')`;
  if (q.flag === 'reported') where.push(`${reportCountSql} > 0`);
  params.push(q.limit);
  return query<TeacherCommentRow>(
    `SELECT c.*, u.id AS a_id, u.name AS a_name, u.display_name AS a_display_name, u.class_id AS a_class_id,
            u.student_no AS a_student_no, u.tier AS a_tier, u.is_reporter AS a_is_reporter,
            k.id AS c_id, k.name AS c_name, k.grade AS c_grade,
            ${reportCountSql} AS report_count,
            p.id AS p_id, p.type AS p_type, p.title AS p_title, LEFT(p.body, 60) AS p_body,
            pa.display_name AS p_author_display
     FROM comments c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN classes k ON k.id = u.class_id
       LEFT JOIN posts p ON c.target_type = 'post' AND p.id = c.target_id
       LEFT JOIN users pa ON pa.id = p.author_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
    params,
  );
}

export async function countCommentsSince(classIds: number[], since: string): Promise<number> {
  if (classIds.length === 0) return 0;
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM comments c JOIN users u ON u.id = c.author_id
     WHERE u.class_id IN (${classIds.map(() => '?').join(',')}) AND c.status <> 'deleted' AND c.created_at >= ?`,
    [...classIds, since],
  );
  return Number(r?.n ?? 0);
}

export interface LastCheck {
  checked_at: Date;
  teacher_name: string;
}

export async function lastCommentCheck(scope: string, scopeId: string): Promise<LastCheck | null> {
  return queryOne<LastCheck>(
    `SELECT cc.checked_at, u.name AS teacher_name FROM comment_review_checks cc JOIN users u ON u.id = cc.teacher_id
     WHERE cc.scope = ? AND cc.scope_id = ? ORDER BY cc.checked_at DESC LIMIT 1`,
    [scope, scopeId],
  );
}

export async function insertCommentCheck(
  teacherId: number,
  scope: string,
  scopeId: string,
): Promise<void> {
  await insert('INSERT INTO comment_review_checks (teacher_id, scope, scope_id) VALUES (?, ?, ?)', [
    teacherId,
    scope,
    scopeId,
  ]);
}
