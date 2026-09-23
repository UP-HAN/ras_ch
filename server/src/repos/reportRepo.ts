/**
 * 신고(reports) 저장소 (RCT-05, TCH-04). target_type 'post' | 'comment'
 */
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

export type ReportStatus = 'open' | 'kept' | 'hidden' | 'deleted';

export interface ReportRow {
  id: number;
  reporter_id: number;
  target_type: string;
  target_id: number;
  reason: string;
  status: ReportStatus;
  handled_by: number | null;
  handled_at: Date | null;
  created_at: Date;
}

export async function insertReport(
  reporterId: number,
  targetType: string,
  targetId: number,
  reason: string,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
    [reporterId, targetType, targetId, reason],
    conn,
  );
}

/** 서로 다른 학생의 open 신고 수 */
export async function countOpenReports(
  targetType: string,
  targetId: number,
  conn: Executor = getPool(),
): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE target_type = ? AND target_id = ? AND status = 'open'",
    [targetType, targetId],
    conn,
  );
  return Number(r?.n ?? 0);
}

export async function findReport(id: number): Promise<ReportRow | null> {
  return queryOne<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
}

/** 같은 대상의 신고를 한꺼번에 처리 */
export async function settleReports(
  targetType: string,
  targetId: number,
  status: ReportStatus,
  handledBy: number | null,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    "UPDATE reports SET status = ?, handled_by = ?, handled_at = NOW(3) WHERE target_type = ? AND target_id = ? AND status = 'open'",
    [status, handledBy, targetType, targetId],
    conn,
  );
}

export interface ReportListRow extends ReportRow {
  reporter_display: string;
  reporter_class: string | null;
  /** 대상 작성자·반(교사 뷰) */
  target_author_id: number | null;
  target_author_name: string | null;
  target_class_id: number | null;
  target_class_name: string | null;
  target_preview: string | null;
  target_status: string | null;
  target_post_id: number | null;
  report_count: number;
}

/** 담당 반 학생이 쓴 글·댓글에 대한 신고 목록 (담임·학년군·approver 범위는 호출자가 classIds 로 준다) */
export async function listReportsForClasses(
  classIds: number[],
  status: ReportStatus | 'all',
  limit = 200,
): Promise<ReportListRow[]> {
  if (classIds.length === 0) return [];
  const ph = classIds.map(() => '?').join(',');
  const statusSql = status === 'all' ? '' : 'AND r.status = ?';
  const params: unknown[] = [...classIds, ...classIds];
  if (status !== 'all') params.push(status);
  params.push(limit);
  return query<ReportListRow>(
    `SELECT r.*, ru.display_name AS reporter_display, rk.name AS reporter_class,
            COALESCE(p.author_id, c.author_id) AS target_author_id,
            COALESCE(pu.name, cu.name) AS target_author_name,
            COALESCE(pu.class_id, cu.class_id) AS target_class_id,
            COALESCE(pk.name, ck.name) AS target_class_name,
            COALESCE(p.title, LEFT(p.body, 80), LEFT(c.body, 80)) AS target_preview,
            COALESCE(p.status, c.status) AS target_status,
            COALESCE(p.id, IF(c.target_type = 'post', c.target_id, NULL)) AS target_post_id,
            (SELECT COUNT(DISTINCT r2.reporter_id) FROM reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id AND r2.status = 'open') AS report_count
     FROM reports r
       JOIN users ru ON ru.id = r.reporter_id LEFT JOIN classes rk ON rk.id = ru.class_id
       LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN users pu ON pu.id = p.author_id LEFT JOIN classes pk ON pk.id = pu.class_id
       LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN users cu ON cu.id = c.author_id LEFT JOIN classes ck ON ck.id = cu.class_id
     WHERE (pu.class_id IN (${ph}) OR cu.class_id IN (${ph})) ${statusSql}
     ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT ?`,
    params,
  );
}
