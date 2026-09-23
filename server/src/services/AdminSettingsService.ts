/**
 * 관리자 설정: 규칙표 편집(PT-05), 승인 모드(APR-01), 검토 담당(APR-02, 02a), 교사 검토 계정(APR-12)
 * 모든 변경은 audit_logs 에 남기고, 규칙표는 point_rule_history 스냅샷 + version+1.
 */
import { execute, insert, query, queryOne, tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { generateInitialPassword, hashPassword } from '../lib/password.js';
import { kst } from '../lib/time.js';
import * as approvalRepo from '../repos/approvalSettingsRepo.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as classRepo from '../repos/classRepo.js';
import * as reviewRepo from '../repos/reviewRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import * as userRepo from '../repos/userRepo.js';
import type {
  ApprovalSettingView,
  PointCapView,
  PointRuleView,
  ReviewAssignmentView,
  ReviewerCandidateView,
} from '../types/api.js';
import type { PointCap, PointRuleRow } from '../types/db.js';

interface Actor {
  id: number;
  ip?: string;
}

// ---------- 규칙표 (PT-05) ----------

function toRuleView(r: PointRuleRow): PointRuleView {
  return {
    code: r.code,
    name: r.name,
    amount: r.amount,
    amountMin: r.amount_min,
    amountMax: r.amount_max,
    caps: (r.caps ?? []) as PointCapView[],
    isActive: r.is_active === 1,
    version: r.version,
    description: r.description,
  };
}

export async function listPointRules(): Promise<PointRuleView[]> {
  const rows = await query<PointRuleRow>('SELECT * FROM point_rules ORDER BY sort, id');
  return rows.map(toRuleView);
}

export interface PointRuleInput {
  amount: number;
  amountMin: number | null;
  amountMax: number | null;
  caps: PointCap[];
  isActive: boolean;
}

const CAP_SCOPES = new Set(['day', 'week', 'month', 'per_object', 'streak']);

export function validateCaps(caps: unknown): PointCap[] {
  if (!Array.isArray(caps)) throw AppError.badRequest('상한 목록이 올바르지 않아요.');
  return caps.map((c) => {
    const cap = c as Partial<PointCap>;
    if (
      !cap ||
      !CAP_SCOPES.has(String(cap.scope)) ||
      (cap.unit !== 'count' && cap.unit !== 'points')
    )
      throw AppError.badRequest('상한 범위·단위가 올바르지 않아요.');
    if (!Number.isInteger(cap.max) || (cap.max as number) < 0)
      throw AppError.badRequest('상한 값은 0 이상 정수로 적어 주세요.');
    const out: PointCap = {
      scope: cap.scope as PointCap['scope'],
      unit: cap.unit,
      max: cap.max as number,
    };
    if (Array.isArray(cap.share_codes) && cap.share_codes.length > 0)
      out.share_codes = cap.share_codes.map(String);
    if (cap.by === 'granter') out.by = 'granter';
    return out;
  });
}

export async function updatePointRule(
  actor: Actor,
  code: string,
  input: PointRuleInput,
): Promise<PointRuleView> {
  const rule = await queryOne<PointRuleRow>('SELECT * FROM point_rules WHERE code = ?', [code]);
  if (!rule) throw AppError.notFound('규칙을 찾을 수 없어요.');
  if (!Number.isInteger(input.amount) || input.amount < 0)
    throw AppError.badRequest('포인트는 0 이상 정수로 적어 주세요.');
  const hasRange = input.amountMin !== null || input.amountMax !== null;
  if (hasRange) {
    if (
      input.amountMin === null ||
      input.amountMax === null ||
      input.amountMin > input.amountMax ||
      input.amountMin < 0
    )
      throw AppError.badRequest('최소·최대 범위를 확인해 주세요.');
  }
  const caps = validateCaps(input.caps);
  await tx(async (conn) => {
    // 이전 버전 스냅샷 (이력)
    await insert(
      'INSERT INTO point_rule_history (rule_code, version, snapshot, changed_by) VALUES (?, ?, ?, ?)',
      [code, rule.version, JSON.stringify(toRuleView(rule)), actor.id],
      conn,
    );
    await execute(
      `UPDATE point_rules SET amount = ?, amount_min = ?, amount_max = ?, caps = ?, is_active = ?, version = version + 1 WHERE code = ?`,
      [
        input.amount,
        input.amountMin,
        input.amountMax,
        JSON.stringify(caps),
        input.isActive ? 1 : 0,
        code,
      ],
      conn,
    );
    await writeAudit(
      {
        actorId: actor.id,
        action: 'point_rule.update',
        targetType: 'point_rule',
        targetId: rule.id,
        payload: { code, before: toRuleView(rule), after: input },
        ip: actor.ip,
      },
      conn,
    );
  });
  const after = await queryOne<PointRuleRow>('SELECT * FROM point_rules WHERE code = ?', [code]);
  return toRuleView(after as PointRuleRow);
}

// ---------- 승인 모드 (APR-01, 07, 14) ----------

export async function listApprovalSettings(): Promise<ApprovalSettingView[]> {
  const rows = await approvalRepo.listApprovalSettings();
  const year = await currentSchoolYear();
  const classes = year ? await classRepo.listClassesByYear(year.id) : [];
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const views: ApprovalSettingView[] = rows.map((r) => ({
    scope: r.scope,
    scopeId: r.scope_id,
    label:
      r.scope === 'school'
        ? '학교 전체'
        : r.scope === 'grade'
          ? `${r.scope_id}학년`
          : (className.get(r.scope_id ?? -1) ?? `반 ${r.scope_id}`),
    mode: r.mode,
    autoEscalateHours: r.auto_escalate_hours,
    autoApproveTeacherReview: r.auto_approve_teacher_review === 1,
  }));
  if (!views.some((v) => v.scope === 'school')) {
    views.unshift({
      scope: 'school',
      scopeId: null,
      label: '학교 전체',
      mode: 'two_step',
      autoEscalateHours: 48,
      autoApproveTeacherReview: false,
    });
  }
  return views;
}

export async function saveApprovalSetting(
  actor: Actor,
  input: {
    scope: 'school' | 'grade' | 'class';
    scopeId: number | null;
    mode: 'two_step' | 'teacher_only';
    autoEscalateHours: number;
    autoApproveTeacherReview: boolean;
  },
): Promise<void> {
  if (input.scope === 'school' && input.scopeId !== null)
    throw AppError.badRequest('학교 범위는 번호가 없어요.');
  if (input.scope === 'grade' && (input.scopeId === null || ![3, 4, 5, 6].includes(input.scopeId)))
    throw AppError.badRequest('학년은 3~6 중 하나예요.');
  if (input.scope === 'class') {
    if (input.scopeId === null || !(await classRepo.findClassById(input.scopeId)))
      throw AppError.notFound('반을 찾을 수 없어요.');
  }
  if (
    !Number.isInteger(input.autoEscalateHours) ||
    input.autoEscalateHours < 1 ||
    input.autoEscalateHours > 720
  )
    throw AppError.badRequest('자동 승격 시간은 1~720시간 사이로 적어 주세요.');
  await approvalRepo.upsertApprovalSetting(input, actor.id);
  await writeAudit({
    actorId: actor.id,
    action: 'approval_setting.save',
    targetType: 'approval_setting',
    payload: input,
    ip: actor.ip,
  });
}

export async function removeApprovalSetting(
  actor: Actor,
  scope: 'grade' | 'class',
  scopeId: number,
): Promise<void> {
  await approvalRepo.deleteApprovalSetting(scope, scopeId);
  await writeAudit({
    actorId: actor.id,
    action: 'approval_setting.delete',
    targetType: 'approval_setting',
    payload: { scope, scopeId },
    ip: actor.ip,
  });
}

// ---------- 검토 담당 (APR-02, 02a) ----------

const POST_TYPES = new Set(['report', 'article']);
const toDate = (d: string | Date) => kst(d).format('YYYY-MM-DD');

function toAssignmentView(r: reviewRepo.AssignmentListRow): ReviewAssignmentView {
  return {
    id: r.id,
    reviewerUserId: r.reviewer_user_id,
    reviewerKind: r.reviewer_kind,
    reviewerName: r.reviewer_name,
    reviewerDisplayName: r.reviewer_display,
    reviewerClass: r.reviewer_class,
    grades: r.grades,
    postTypes: r.post_types,
    allowedResults: r.allowed_results,
    dailyCap: r.daily_cap,
    preset: r.preset,
    startsAt: toDate(r.starts_at),
    endsAt: r.ends_at ? toDate(r.ends_at) : null,
    isActive: r.is_active === 1,
  };
}

export async function listReviewAssignments(): Promise<ReviewAssignmentView[]> {
  return (await reviewRepo.listAssignments()).map(toAssignmentView);
}

export async function listReviewerCandidates(): Promise<ReviewerCandidateView[]> {
  return (await reviewRepo.listReviewerCandidates()).map((c) => ({
    id: c.id,
    name: c.name,
    displayName: c.display_name,
    role: c.role,
    className: c.class_name,
    grade: c.grade,
    title: c.title,
  }));
}

export interface AssignmentBody {
  grades: number[];
  postTypes: string[];
  allowedResults: 'pass_only' | 'pass_hold';
  dailyCap: number;
  preset: 'assist' | 'basic' | 'senior' | 'custom';
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}

function validateAssignment(b: AssignmentBody): void {
  if (b.grades.length === 0 || b.grades.some((g) => ![3, 4, 5, 6].includes(g)))
    throw AppError.badRequest('담당 학년을 3~6 중에서 골라 주세요.');
  if (b.postTypes.length === 0 || b.postTypes.some((t) => !POST_TYPES.has(t)))
    throw AppError.badRequest('글 유형은 리포트·기사 중에서 골라 주세요.');
  if (!Number.isInteger(b.dailyCap) || b.dailyCap < 1 || b.dailyCap > 999)
    throw AppError.badRequest('하루 검토 상한은 1~999 사이예요.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(b.startsAt) ||
    (b.endsAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(b.endsAt))
  )
    throw AppError.badRequest('임기 날짜 형식이 올바르지 않아요.');
  if (b.endsAt !== null && b.endsAt < b.startsAt)
    throw AppError.badRequest('임기 끝이 시작보다 빠를 수 없어요.');
}

async function logAssignmentChange(actor: Actor, note: string): Promise<void> {
  await insert(
    "INSERT INTO review_logs (post_id, actor_id, actor_role, action, note) VALUES (NULL, ?, 'admin', 'assignment_change', ?)",
    [actor.id, note.slice(0, 500)],
  );
}

export async function createReviewAssignment(
  actor: Actor,
  reviewerUserId: number,
  body: AssignmentBody,
): Promise<number> {
  validateAssignment(body);
  const candidates = await reviewRepo.listReviewerCandidates();
  const target = candidates.find((c) => c.id === reviewerUserId);
  if (!target)
    throw AppError.badRequest('활성 자치회 임원이나 교사 검토 계정만 검토 담당이 될 수 있어요.');
  const kind = target.role === 'student' ? 'student' : 'teacher';
  const id = await reviewRepo.insertAssignment({
    ...body,
    reviewerUserId,
    reviewerKind: kind,
    setBy: actor.id,
  });
  await logAssignmentChange(
    actor,
    `검토 담당 추가 #${id}: 학년 ${body.grades.join(',')} / ${body.postTypes.join(',')} / ${body.allowedResults} / 일 ${body.dailyCap}`,
  );
  await writeAudit({
    actorId: actor.id,
    action: 'review_assignment.create',
    targetType: 'review_assignment',
    targetId: id,
    payload: { reviewerUserId, ...body },
    ip: actor.ip,
  });
  return id;
}

export async function updateReviewAssignment(
  actor: Actor,
  id: number,
  body: AssignmentBody,
): Promise<void> {
  validateAssignment(body);
  const exists = await queryOne<{ id: number }>('SELECT id FROM review_assignments WHERE id = ?', [
    id,
  ]);
  if (!exists) throw AppError.notFound('검토 담당을 찾을 수 없어요.');
  await reviewRepo.updateAssignment(id, { ...body, setBy: actor.id });
  await logAssignmentChange(
    actor,
    `검토 담당 수정 #${id}: 학년 ${body.grades.join(',')} / ${body.postTypes.join(',')} / ${body.allowedResults} / 일 ${body.dailyCap} / ${body.isActive ? '활성' : '중지'}`,
  );
  await writeAudit({
    actorId: actor.id,
    action: 'review_assignment.update',
    targetType: 'review_assignment',
    targetId: id,
    payload: { ...body },
    ip: actor.ip,
  });
}

export async function deactivateReviewAssignment(actor: Actor, id: number): Promise<void> {
  await reviewRepo.deactivateAssignment(id);
  await logAssignmentChange(actor, `검토 담당 해제 #${id}`);
  await writeAudit({
    actorId: actor.id,
    action: 'review_assignment.deactivate',
    targetType: 'review_assignment',
    targetId: id,
    ip: actor.ip,
  });
}

// ---------- 교사 검토 계정 (APR-12) ----------

export async function createCouncilAccount(
  actor: Actor,
  teacherId: number,
): Promise<{ id: number; loginId: string; password: string }> {
  const teacher = await userRepo.findUserById(teacherId);
  if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'admin'))
    throw AppError.notFound('교사를 찾을 수 없어요.');
  if (teacher.linked_council_account_id) throw AppError.conflict('이미 검토 계정이 연결돼 있어요.');
  const loginId = `council:${teacher.login_id}`;
  if (await userRepo.findUserByLoginId(loginId))
    throw AppError.conflict('같은 이름의 검토 계정이 이미 있어요.');
  const password = `${generateInitialPassword(teacher.name)}${Math.random().toString(36).slice(2, 8)}`;
  const hash = await hashPassword(password);
  const id = await tx(async (conn) => {
    const newId = await insert(
      `INSERT INTO users (login_id, password_hash, role, name, display_name, must_change_pw)
       VALUES (?, ?, 'council_teacher', ?, ?, 0)`,
      [loginId, hash, `${teacher.name}(검토)`, `${teacher.name}(검토)`],
      conn,
    );
    await execute(
      'UPDATE users SET linked_council_account_id = ? WHERE id = ?',
      [newId, teacherId],
      conn,
    );
    // 기본 담당: 전 학년·전 유형·통과+보류·상한 999 (APR-12)
    await insert(
      `INSERT INTO review_assignments (reviewer_user_id, reviewer_kind, grades, post_types, allowed_results, daily_cap, preset, starts_at, ends_at, is_active, set_by)
       VALUES (?, 'teacher', '[3,4,5,6]', '["report","article"]', 'pass_hold', 999, 'custom', CURDATE(), NULL, 1, ?)`,
      [newId, actor.id],
      conn,
    );
    await writeAudit(
      {
        actorId: actor.id,
        action: 'council_account.create',
        targetType: 'user',
        targetId: newId,
        payload: { teacherId },
        ip: actor.ip,
      },
      conn,
    );
    return newId;
  });
  return { id, loginId, password };
}
