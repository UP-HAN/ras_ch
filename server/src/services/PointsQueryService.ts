/**
 * 포인트 조회·교사 칭찬·리빌드 (PT-04, PT-06, PT-08)
 */
import { AppError } from '../lib/apiResponse.js';
import { dayKey, monthKey, weekKey } from '../lib/time.js';
import { canAccessClass } from '../middleware/auth.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as ledgerRepo from '../repos/ledgerRepo.js';
import * as postRepo from '../repos/postRepo.js';
import { query, tx } from '../db/query.js';
import { grantApprovalPoints } from './PostService.js';
import { getSetting } from '../repos/settingsRepo.js';
import * as userRepo from '../repos/userRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { BonusResult, LedgerItemView, PointsSummaryView } from '../types/api.js';
import { applyPointsSafe, reversePointsSafe } from './points/safeApply.js';

const RULE_LABEL: Record<string, string> = {};
/** 승인으로 지급되는 규칙(회수 대상) — PostService.grantApprovalPoints 와 짝 */
const APPROVAL_RULES = [
  'REPORT_APPROVED',
  'REPORT_DECREASE',
  'GOAL_CHECKED',
  'ARTICLE_APPROVED',
  'REPORTER_BONUS',
] as const;

function toItem(r: ledgerRepo.HistoryRow): LedgerItemView {
  return {
    id: r.id,
    ruleCode: r.rule_code,
    ruleName: r.rule_name ?? RULE_LABEL[r.rule_code] ?? r.rule_code,
    amount: r.amount,
    isReversal: r.reversal_of !== null,
    note: r.note,
    refType: r.ref_type,
    refId: r.ref_id,
    grantedByName: r.granted_by_name,
    dayKey: r.day_key,
    weekKey: r.week_key,
    createdAt: r.created_at.toISOString(),
  };
}

export async function pointsSummary(
  userId: number,
  range: 'week' | 'month' | 'all',
): Promise<PointsSummaryView> {
  const now = new Date();
  const wk = weekKey(now);
  const mk = monthKey(now);
  const [week, month, all] = await Promise.all([
    ledgerRepo.sumFor(userId, 'week', wk),
    ledgerRepo.sumFor(userId, 'month', mk),
    ledgerRepo.sumFor(userId, 'all', ''),
  ]);
  const items = await ledgerRepo.history(userId, range, range === 'week' ? wk : mk, 100);
  return { weekKey: wk, monthKey: mk, week, month, all, range, items: items.map(toItem) };
}

/** PT-04 교사 칭찬: 담당 반 학생에게 5~20P, 사유 필수, 학생 주 50·교사 주 300 (규칙표 caps) */
export async function teacherBonus(
  teacher: AuthUser,
  studentId: number,
  amount: number,
  reasonRaw: string,
  ip?: string,
): Promise<BonusResult> {
  const reason = reasonRaw.trim();
  if (Array.from(reason).length < 2 || Array.from(reason).length > 100)
    throw AppError.badRequest('칭찬 이유를 2~100자로 적어 주세요.');
  const student = await userRepo.findUserById(studentId);
  if (!student || student.role !== 'student' || !student.class_id)
    throw AppError.notFound('학생을 찾을 수 없어요.');
  if (!(await canAccessClass(teacher, student.class_id)))
    throw AppError.forbidden('이 학생을 관리할 권한이 없어요.');

  const limits = await getSetting('teacher_bonus', {
    min: 5,
    max: 20,
    per_student_week: 50,
    per_teacher_week: 300,
  });
  const r = await applyPointsSafe({
    ruleCode: 'TEACHER_BONUS',
    userId: studentId,
    grantedBy: teacher.row.id,
    amount,
    note: reason,
    refType: 'teacher_bonus',
    refId: null as unknown as number,
    eventKey: `TEACHER_BONUS:${teacher.row.id}:${studentId}:${Date.now()}`,
  });
  const wk = weekKey();
  const usedStudent = await ledgerRepo.usage({
    ruleCodes: ['TEACHER_BONUS'],
    scope: 'week',
    by: 'user',
    subjectId: studentId,
    dayKey: dayKey(),
    weekKey: wk,
    monthKey: monthKey(),
    objectType: null,
    objectId: null,
  });
  const usedTeacher = await ledgerRepo.usage({
    ruleCodes: ['TEACHER_BONUS'],
    scope: 'week',
    by: 'granter',
    subjectId: teacher.row.id,
    dayKey: dayKey(),
    weekKey: wk,
    monthKey: monthKey(),
    objectType: null,
    objectId: null,
  });
  const remaining = {
    student: Math.max(0, limits.per_student_week - usedStudent.points),
    teacher: Math.max(0, limits.per_teacher_week - usedTeacher.points),
  };
  if (!r.granted) {
    if (r.reason === 'AMOUNT_OUT_OF_RANGE')
      throw AppError.badRequest(`칭찬 포인트는 ${limits.min}~${limits.max}P 사이로 주세요.`);
    throw new AppError(
      409,
      'CAP_REACHED',
      `이번 주 한도에 닿았어요. 이 학생에게 ${remaining.student}P, 선생님 전체 ${remaining.teacher}P 남았어요.`,
    );
  }
  await writeAudit({
    actorId: teacher.row.id,
    action: 'points.teacher_bonus',
    targetType: 'user',
    targetId: studentId,
    payload: { amount: r.amount, reason },
    ip,
  });
  return {
    granted: r.amount,
    remainingStudentWeek: remaining.student,
    remainingTeacherWeek: remaining.teacher,
  };
}

/**
 * PT-08 리빌드(누락 복구): 범위 안 승인 글의 승인 포인트를 멱등 재적용하고,
 * 반려·숨김·삭제된 글에 남은 미회수 지급을 회수한다. 전체 재계산은 3차.
 */
export async function rebuildPoints(
  actor: AuthUser,
  from: string,
  to: string,
  ip?: string,
): Promise<{ applied: number; reversed: number }> {
  const approved = await query<{ id: number; type: string }>(
    "SELECT id, type FROM posts WHERE status = 'approved' AND deleted_at IS NULL AND approved_at >= ? AND approved_at < DATE_ADD(?, INTERVAL 1 DAY)",
    [from, to],
  );
  let applied = 0;
  for (const p of approved) {
    applied += await tx(async (conn) => {
      const bundle = await postRepo.loadBundle(p.id, conn);
      return bundle ? grantApprovalPoints(bundle, conn, '리빌드') : 0;
    });
  }
  const dead = await query<{ id: number }>(
    "SELECT id FROM posts WHERE (status IN ('rejected','hidden') OR deleted_at IS NOT NULL) AND updated_at >= ? AND updated_at < DATE_ADD(?, INTERVAL 1 DAY)",
    [from, to],
  );
  let reversed = 0;
  for (const p of dead) {
    // 작성자 승인 포인트만 회수 (검토자 REVIEW_DONE 등 다른 근거는 건드리지 않음)
    const r = await reversePointsSafe('post', p.id, {
      note: '리빌드 회수',
      actorId: actor.row.id,
      ruleCodes: [...APPROVAL_RULES],
    });
    reversed += r.reversedLedgerIds.length;
  }
  await writeAudit({
    actorId: actor.row.id,
    action: 'points.rebuild',
    payload: { from, to, applied, reversed },
    ip,
  });
  return { applied, reversed };
}
