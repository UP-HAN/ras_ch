/**
 * review_assignments / review_logs 저장소 (APR-02a, 08, 09)
 */
import { execute, insert, query, queryOne } from '../db/query.js';

export interface AssignmentRow {
  id: number;
  reviewer_user_id: number;
  reviewer_kind: 'student' | 'teacher';
  grades: number[];
  post_types: string[];
  allowed_results: 'pass_only' | 'pass_hold';
  daily_cap: number;
  preset: 'assist' | 'basic' | 'senior' | 'custom';
  starts_at: string | Date;
  ends_at: string | Date | null;
  is_active: 0 | 1;
  set_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export async function activeAssignmentFor(userId: number): Promise<AssignmentRow | null> {
  return queryOne<AssignmentRow>(
    `SELECT * FROM review_assignments WHERE reviewer_user_id = ? AND is_active = 1
       AND starts_at <= CURDATE() AND (ends_at IS NULL OR ends_at >= CURDATE())
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
}

export interface AssignmentListRow extends AssignmentRow {
  reviewer_name: string;
  reviewer_display: string;
  reviewer_role: string;
  reviewer_class: string | null;
}

export async function listAssignments(): Promise<AssignmentListRow[]> {
  return query<AssignmentListRow>(
    `SELECT ra.*, u.name AS reviewer_name, u.display_name AS reviewer_display, u.role AS reviewer_role, c.name AS reviewer_class
     FROM review_assignments ra JOIN users u ON u.id = ra.reviewer_user_id LEFT JOIN classes c ON c.id = u.class_id
     ORDER BY ra.is_active DESC, ra.reviewer_kind, u.name`,
  );
}

export interface AssignmentInput {
  reviewerUserId: number;
  reviewerKind: 'student' | 'teacher';
  grades: number[];
  postTypes: string[];
  allowedResults: 'pass_only' | 'pass_hold';
  dailyCap: number;
  preset: 'assist' | 'basic' | 'senior' | 'custom';
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  setBy: number;
}

export async function insertAssignment(a: AssignmentInput): Promise<number> {
  return insert(
    `INSERT INTO review_assignments (reviewer_user_id, reviewer_kind, grades, post_types, allowed_results, daily_cap, preset, starts_at, ends_at, is_active, set_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.reviewerUserId,
      a.reviewerKind,
      JSON.stringify(a.grades),
      JSON.stringify(a.postTypes),
      a.allowedResults,
      a.dailyCap,
      a.preset,
      a.startsAt,
      a.endsAt,
      a.isActive ? 1 : 0,
      a.setBy,
    ],
  );
}

export async function updateAssignment(
  id: number,
  a: Omit<AssignmentInput, 'reviewerUserId' | 'reviewerKind'>,
): Promise<void> {
  await execute(
    `UPDATE review_assignments SET grades = ?, post_types = ?, allowed_results = ?, daily_cap = ?, preset = ?, starts_at = ?, ends_at = ?, is_active = ?, set_by = ? WHERE id = ?`,
    [
      JSON.stringify(a.grades),
      JSON.stringify(a.postTypes),
      a.allowedResults,
      a.dailyCap,
      a.preset,
      a.startsAt,
      a.endsAt,
      a.isActive ? 1 : 0,
      a.setBy,
      id,
    ],
  );
}

export async function deactivateAssignment(id: number): Promise<void> {
  await execute('UPDATE review_assignments SET is_active = 0 WHERE id = ?', [id]);
}

/** 검토 담당 후보: 활성 임원 학생 + 교사 검토 계정 */
export interface CandidateRow {
  id: number;
  name: string;
  display_name: string;
  role: string;
  class_name: string | null;
  grade: number | null;
  title: string | null;
}

export async function listReviewerCandidates(): Promise<CandidateRow[]> {
  return query<CandidateRow>(
    `SELECT u.id, u.name, u.display_name, u.role, c.name AS class_name, c.grade, cm.title
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
       LEFT JOIN council_members cm ON cm.user_id = u.id AND cm.is_active = 1
     WHERE (u.role = 'student' AND cm.id IS NOT NULL) OR u.role = 'council_teacher'
     ORDER BY u.role, c.grade, u.name`,
  );
}

/** 오늘 이 검토자가 처리한 건수 (하루 상한) */
export async function countReviewsToday(actorId: number, dayStart: string): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM review_logs WHERE actor_id = ? AND action IN ('pass','hold') AND created_at >= ?",
    [actorId, dayStart],
  );
  return Number(r?.n ?? 0);
}

export interface ReviewLogRow {
  id: number;
  post_id: number | null;
  actor_id: number | null;
  actor_role: string;
  action: string;
  checklist: Record<string, boolean> | null;
  note: string | null;
  created_at: Date;
  actor_name: string | null;
}

export async function listReviewLogs(postId: number): Promise<ReviewLogRow[]> {
  return query<ReviewLogRow>(
    `SELECT rl.*, u.name AS actor_name FROM review_logs rl LEFT JOIN users u ON u.id = rl.actor_id
     WHERE rl.post_id = ? ORDER BY rl.created_at ASC, rl.id ASC`,
    [postId],
  );
}
