/**
 * approval_settings (APR-01, 07, 14): school → grade → class 순으로 덮어쓰기
 */
import { execute, query, queryOne } from '../db/query.js';

export type ApprovalMode = 'two_step' | 'teacher_only';

export interface ApprovalSettingRow {
  id: number;
  scope: 'school' | 'grade' | 'class';
  scope_id: number | null;
  mode: ApprovalMode;
  auto_escalate_hours: number;
  auto_approve_teacher_review: 0 | 1;
  updated_by: number | null;
  updated_at: Date;
}

export interface ResolvedApproval {
  mode: ApprovalMode;
  autoEscalateHours: number;
  autoApproveTeacherReview: boolean;
  /** 어느 범위 설정이 적용됐는지 */
  source: 'class' | 'grade' | 'school' | 'default';
}

export async function listApprovalSettings(): Promise<ApprovalSettingRow[]> {
  return query<ApprovalSettingRow>(
    "SELECT * FROM approval_settings ORDER BY FIELD(scope, 'school', 'grade', 'class'), scope_id",
  );
}

export async function resolveApproval(classId: number, grade: number): Promise<ResolvedApproval> {
  const row = await queryOne<ApprovalSettingRow>(
    `SELECT * FROM approval_settings
     WHERE (scope = 'class' AND scope_id = ?) OR (scope = 'grade' AND scope_id = ?) OR scope = 'school'
     ORDER BY FIELD(scope, 'class', 'grade', 'school') LIMIT 1`,
    [classId, grade],
  );
  if (!row)
    return {
      mode: 'two_step',
      autoEscalateHours: 48,
      autoApproveTeacherReview: false,
      source: 'default',
    };
  return {
    mode: row.mode,
    autoEscalateHours: row.auto_escalate_hours,
    autoApproveTeacherReview: row.auto_approve_teacher_review === 1,
    source: row.scope,
  };
}

/** 모든 반의 해석 결과 (검토 큐에서 teacher_only 반 제외용) */
export async function resolveAllClasses(
  classes: Array<{ id: number; grade: number }>,
): Promise<Map<number, ResolvedApproval>> {
  const rows = await listApprovalSettings();
  const school = rows.find((r) => r.scope === 'school');
  const byGrade = new Map(rows.filter((r) => r.scope === 'grade').map((r) => [r.scope_id, r]));
  const byClass = new Map(rows.filter((r) => r.scope === 'class').map((r) => [r.scope_id, r]));
  const out = new Map<number, ResolvedApproval>();
  for (const c of classes) {
    const row = byClass.get(c.id) ?? byGrade.get(c.grade) ?? school ?? null;
    out.set(
      c.id,
      row
        ? {
            mode: row.mode,
            autoEscalateHours: row.auto_escalate_hours,
            autoApproveTeacherReview: row.auto_approve_teacher_review === 1,
            source: row.scope,
          }
        : {
            mode: 'two_step',
            autoEscalateHours: 48,
            autoApproveTeacherReview: false,
            source: 'default',
          },
    );
  }
  return out;
}

export async function upsertApprovalSetting(
  input: {
    scope: 'school' | 'grade' | 'class';
    scopeId: number | null;
    mode: ApprovalMode;
    autoEscalateHours: number;
    autoApproveTeacherReview: boolean;
  },
  updatedBy: number,
): Promise<void> {
  await execute(
    `INSERT INTO approval_settings (scope, scope_id, mode, auto_escalate_hours, auto_approve_teacher_review, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mode = VALUES(mode), auto_escalate_hours = VALUES(auto_escalate_hours),
       auto_approve_teacher_review = VALUES(auto_approve_teacher_review), updated_by = VALUES(updated_by)`,
    [
      input.scope,
      input.scopeId,
      input.mode,
      input.autoEscalateHours,
      input.autoApproveTeacherReview ? 1 : 0,
      updatedBy,
    ],
  );
}

export async function deleteApprovalSetting(
  scope: 'grade' | 'class',
  scopeId: number,
): Promise<void> {
  await execute('DELETE FROM approval_settings WHERE scope = ? AND scope_id = ?', [scope, scopeId]);
}
