/**
 * 버그 신고 (BUG-01~05)
 *  - 학생·교사 모두 신고하고, 본인 글과 관리자 답변만 본다(2026-10-06 사용자 결정)
 *  - 전체 목록·상태 변경·답변은 admin 전용. 캡처는 신고자와 관리자만 볼 수 있다(BUG-05)
 *  - 학생용 응답에 실명·반을 넣지 않는다(절대 규칙 4)
 */
import { AppError } from '../lib/apiResponse.js';
import {
  BUG_LIMITS,
  BUG_STATUS_LABEL,
  canViewReport,
  validateBugInput,
  validateReply,
  type BugInput,
  type BugStatus,
} from '../lib/bugReportRules.js';
import { notify } from '../lib/notify.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as bugRepo from '../repos/bugReportRepo.js';
import type {
  BugReportAdminListView,
  BugReportAdminView,
  BugReportMineView,
  BugReportView,
} from '../types/api.js';
import { hasRole, type AuthUser } from '../types/auth.js';
import { processPhotos, type UploadedFile } from './PostService.js';

const viewerOf = (user: AuthUser) => ({ id: user.row.id, isAdmin: hasRole(user, 'admin') });

export function toReportView(r: bugRepo.BugReportRow): BugReportView {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    pagePath: r.page_path,
    imagePath: r.image_path,
    status: r.status,
    adminReply: r.admin_reply,
    repliedAt: r.replied_at ? r.replied_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

/** 관리자 화면 전용: 신고자 실명·반이 붙는다 (BUG-05) */
export function toAdminView(r: bugRepo.BugReportRow): BugReportAdminView {
  return {
    ...toReportView(r),
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    reporterRole: r.reporter_role,
    className: r.class_name,
  };
}

// ---------- 신고자 ----------

/** 신고 작성 (BUG-01). 캡처는 1장까지, 기존 이미지 파이프라인을 그대로 쓴다 */
export async function createReport(
  user: AuthUser,
  input: BugInput,
  file: UploadedFile | null,
  ip?: string,
): Promise<BugReportView> {
  const clean = validateBugInput(input);

  const today = await bugRepo.countTodayByUser(user.row.id);
  if (today >= BUG_LIMITS.perDayMax) {
    throw AppError.conflict(
      `오늘은 ${BUG_LIMITS.perDayMax}번까지 보낼 수 있어요. 내일 다시 보내 주세요.`,
    );
  }

  // 5MB·jpg/png/webp 검사와 1280px 리사이즈·EXIF 제거는 processPhotos 가 한다(절대 규칙 8)
  const photos = file ? await processPhotos([file], 1) : [];

  const id = await bugRepo.insertReport({
    reporterId: user.row.id,
    title: clean.title,
    body: clean.body,
    pagePath: clean.pagePath,
    imagePath: photos[0]?.path ?? null,
  });
  await writeAudit({
    actorId: user.row.id,
    action: 'bug.create',
    targetType: 'bug_report',
    targetId: id,
    ip,
  });

  const row = await bugRepo.findById(id);
  if (!row) throw AppError.notFound('신고를 찾을 수 없어요.');
  return toReportView(row);
}

/** 내 신고 목록 (BUG-02) */
export async function myReports(user: AuthUser): Promise<BugReportMineView> {
  const [rows, today] = await Promise.all([
    bugRepo.listMine(user.row.id, 50),
    bugRepo.countTodayByUser(user.row.id),
  ]);
  return {
    remainingToday: Math.max(0, BUG_LIMITS.perDayMax - today),
    perDayMax: BUG_LIMITS.perDayMax,
    reports: rows.map(toReportView),
  };
}

/** 신고 1건 (BUG-02, BUG-05): 본인 또는 관리자만 */
export async function getReport(user: AuthUser, id: number): Promise<BugReportView> {
  const row = await bugRepo.findById(id);
  if (!row) throw AppError.notFound('신고를 찾을 수 없어요.');
  if (!canViewReport(viewerOf(user), row.reporter_id))
    throw AppError.forbidden('이 신고는 볼 수 없어요.');
  return hasRole(user, 'admin') ? toAdminView(row) : toReportView(row);
}

// ---------- 관리자 ----------

export interface AdminListQuery {
  status?: BugStatus;
  limit?: number;
  before?: number;
}

/** 전체 목록 (BUG-03, admin 전용은 라우터에서 검사) */
export async function listForAdmin(q: AdminListQuery): Promise<BugReportAdminListView> {
  const limit = Math.min(100, Math.max(1, q.limit ?? 30));
  const [rows, total, openCount] = await Promise.all([
    bugRepo.listAll({ status: q.status, limit, before: q.before }),
    bugRepo.countAll(q.status),
    bugRepo.countOpen(),
  ]);
  return { total, openCount, reports: rows.map(toAdminView) };
}

export async function openCount(): Promise<number> {
  return bugRepo.countOpen();
}

export interface ReplyInput {
  status: BugStatus;
  adminReply: string | null;
}

/** 상태 변경·답변 (BUG-03) + 신고자 알림 (BUG-04) */
export async function reply(
  actor: AuthUser,
  id: number,
  input: ReplyInput,
  ip?: string,
): Promise<BugReportAdminView> {
  const before = await bugRepo.findById(id);
  if (!before) throw AppError.notFound('신고를 찾을 수 없어요.');
  const adminReply = validateReply(input.adminReply);

  await bugRepo.updateStatusReply(id, {
    status: input.status,
    adminReply,
    repliedBy: actor.row.id,
  });

  const statusChanged = before.status !== input.status;
  if (statusChanged || adminReply) {
    const parts = [`보내 주신 "${before.title}"`];
    if (statusChanged) parts.push(`처리 상태가 "${BUG_STATUS_LABEL[input.status]}"로 바뀌었어요.`);
    if (adminReply) parts.push('선생님 답변이 달렸어요.');
    await notify(before.reporter_id, 'bug_report', {
      message: parts.join(' '),
      link: '/me/bug-report',
      reportId: id,
    });
  }

  await writeAudit({
    actorId: actor.row.id,
    action: 'bug.reply',
    targetType: 'bug_report',
    targetId: id,
    payload: { status: input.status, replied: adminReply !== null },
    ip,
  });

  const row = await bugRepo.findById(id);
  if (!row) throw AppError.notFound('신고를 찾을 수 없어요.');
  return toAdminView(row);
}

/**
 * 캡처 이미지 열람 권한 (BUG-05): 신고자 본인과 관리자만.
 * routes/uploads.ts 에서 자치회 이미지 다음 분기로 쓴다.
 */
export async function canViewImage(user: AuthUser, rel: string): Promise<boolean> {
  const row = await bugRepo.findByImagePath(rel);
  if (!row) return false;
  return canViewReport(viewerOf(user), row.reporter_id);
}
