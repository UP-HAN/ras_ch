/**
 * bug_reports (BUG-01~05): 버그 신고. 얇은 SQL 레이어.
 */
import { execute, insert, query, queryOne } from '../db/query.js';
import type { BugStatus } from '../lib/bugReportRules.js';

export interface BugReportRow {
  id: number;
  reporter_id: number;
  title: string;
  body: string;
  page_path: string | null;
  image_path: string | null;
  status: BugStatus;
  admin_reply: string | null;
  replied_by: number | null;
  replied_at: Date | null;
  created_at: Date;
  updated_at: Date;
  /** 교사·관리자 응답에만 쓴다 (학생용 직렬화에서는 버린다, 절대 규칙 4) */
  reporter_name: string | null;
  reporter_role: string | null;
  class_name: string | null;
}

const SELECT = `SELECT b.*, u.name AS reporter_name, u.role AS reporter_role, c.name AS class_name
  FROM bug_reports b
  LEFT JOIN users u ON u.id = b.reporter_id
  LEFT JOIN classes c ON c.id = u.class_id`;

export interface BugReportInsert {
  reporterId: number;
  title: string;
  body: string;
  pagePath: string | null;
  imagePath: string | null;
}

export async function insertReport(r: BugReportInsert): Promise<number> {
  return insert(
    'INSERT INTO bug_reports (reporter_id, title, body, page_path, image_path) VALUES (?, ?, ?, ?, ?)',
    [r.reporterId, r.title, r.body, r.pagePath, r.imagePath],
  );
}

export async function findById(id: number): Promise<BugReportRow | null> {
  return queryOne<BugReportRow>(`${SELECT} WHERE b.id = ?`, [id]);
}

export async function listMine(reporterId: number, limit = 50): Promise<BugReportRow[]> {
  return query<BugReportRow>(`${SELECT} WHERE b.reporter_id = ? ORDER BY b.id DESC LIMIT ?`, [
    reporterId,
    limit,
  ]);
}

export interface AdminListFilter {
  status?: BugStatus;
  limit: number;
  /** 커서: 이 id 보다 작은 것만 (목록 더 보기) */
  before?: number;
}

export async function listAll(f: AdminListFilter): Promise<BugReportRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status) {
    where.push('b.status = ?');
    params.push(f.status);
  }
  if (f.before) {
    where.push('b.id < ?');
    params.push(f.before);
  }
  const sql = `${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY b.id DESC LIMIT ?`;
  return query<BugReportRow>(sql, [...params, f.limit]);
}

export async function countAll(status?: BugStatus): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM bug_reports${status ? ' WHERE status = ?' : ''}`,
    status ? [status] : [],
  );
  return row?.n ?? 0;
}

/** 오늘(Asia/Seoul 서버 시각) 이 사람이 보낸 수 — 하루 상한 (BUG-01) */
export async function countTodayByUser(reporterId: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM bug_reports WHERE reporter_id = ? AND created_at >= CURDATE()',
    [reporterId],
  );
  return row?.n ?? 0;
}

/** 아직 처리가 남은 건수 — 관리자 메뉴 배지 (BUG-03) */
export async function countOpen(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM bug_reports WHERE status IN ('received','checking')",
  );
  return row?.n ?? 0;
}

export interface StatusReplyUpdate {
  status: BugStatus;
  adminReply: string | null;
  repliedBy: number;
}

export async function updateStatusReply(id: number, u: StatusReplyUpdate): Promise<void> {
  // 답변이 있을 때만 답변자·답변 시각을 남긴다 (상태만 바꾼 경우는 이전 답변을 보존)
  await execute(
    `UPDATE bug_reports
        SET status = ?,
            admin_reply = COALESCE(?, admin_reply),
            replied_by = CASE WHEN ? IS NULL THEN replied_by ELSE ? END,
            replied_at = CASE WHEN ? IS NULL THEN replied_at ELSE NOW(3) END
      WHERE id = ?`,
    [u.status, u.adminReply, u.adminReply, u.repliedBy, u.adminReply, id],
  );
}

/** 캡처 이미지 열람 권한 검사용 (BUG-05) */
export async function findByImagePath(rel: string): Promise<BugReportRow | null> {
  return queryOne<BugReportRow>(`${SELECT} WHERE b.image_path = ?`, [rel]);
}
