/**
 * 게시글 서비스 — 상태 전이는 오직 transition() 한 곳 (RPT-06, 절대 규칙 6)
 *
 *  draft → pending → [reviewed | flagged] → approved | rejected | hidden
 *  - approve   : 포인트 지급 훅(PointService.apply)  ← S4 4-1 전까지 스텁이 NOT_IMPLEMENTED 를 던지면 warn 만 남기고 계속
 *  - reject/hide/delete : 승인됐던 글이면 회수 훅(PointService.reverse)
 *  - resubmit  : 수정 시 1차 검토 결과 초기화
 */
import type { PoolConnection } from 'mysql2/promise';
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import {
  deleteImage,
  processCapture,
  saveImage,
  sniffImageType,
  MAX_IMAGE_BYTES,
} from '../lib/image.js';
import { logger } from '../lib/logger.js';
import { canManagePost, canViewPost, viewerFromAuthUser } from '../lib/postAccess.js';
import {
  diffMinutes,
  isAllowedWeekKey,
  REJECT_REASONS,
  type RejectReasonCode,
} from '../lib/reportRules.js';
import type { PostBundle } from '../lib/serializers/post.js';
import { previousWeekKey, weekRange } from '../lib/time.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as postRepo from '../repos/postRepo.js';
import { insert } from '../db/query.js';
import type { AuthUser } from '../types/auth.js';
import type { ImageKind, PostStatus, Visibility } from '../types/db.js';
import { getPointService } from './points/PointService.js';
import { buildEventKey } from './points/types.js';

export type PostAction =
  'submit' | 'resubmit' | 'approve' | 'reject' | 'hide' | 'unhide' | 'delete';

/** 허용 전이표. delete 는 소프트 삭제(상태 유지) */
export const TRANSITIONS: Record<PostAction, { from: PostStatus[]; to: PostStatus | 'same' }> = {
  submit: { from: ['draft'], to: 'pending' },
  resubmit: { from: ['draft', 'pending', 'reviewed', 'flagged', 'rejected'], to: 'pending' },
  approve: { from: ['pending', 'reviewed', 'flagged'], to: 'approved' },
  reject: { from: ['pending', 'reviewed', 'flagged'], to: 'rejected' },
  hide: { from: ['approved'], to: 'hidden' },
  unhide: { from: ['hidden'], to: 'approved' },
  delete: {
    from: ['draft', 'pending', 'reviewed', 'flagged', 'approved', 'rejected', 'hidden'],
    to: 'same',
  },
};

export const STUDENT_ACTIONS: PostAction[] = ['submit', 'resubmit', 'delete'];
export const TEACHER_ACTIONS: PostAction[] = ['approve', 'reject', 'hide', 'unhide', 'delete'];

export function nextStatus(action: PostAction, current: PostStatus): PostStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw AppError.conflict(`지금 상태(${current})에서는 할 수 없는 작업이에요.`);
  }
  return t.to === 'same' ? current : t.to;
}

export interface TransitionOptions {
  /** reject: 사유 코드 + other 일 때 직접 입력 */
  reasonCode?: RejectReasonCode;
  reasonText?: string;
  /** hide: 사유 */
  hiddenReason?: string;
  ip?: string;
}

export function resolveRejectReason(opts: TransitionOptions): string {
  const code = opts.reasonCode;
  if (!code) throw AppError.badRequest('반려 사유를 골라 주세요.');
  if (code === 'other') {
    const t = (opts.reasonText ?? '').trim();
    if (t.length < 5 || t.length > 200)
      throw AppError.badRequest('반려 사유를 5~200자로 적어 주세요.');
    return t;
  }
  return REJECT_REASONS[code];
}

const actorRole = (u: AuthUser): 'teacher' | 'admin' | 'council' | 'council_teacher' =>
  u.row.role === 'admin'
    ? 'admin'
    : u.row.role === 'council_teacher'
      ? 'council_teacher'
      : u.row.role === 'teacher'
        ? 'teacher'
        : 'council';

async function writeReviewLog(
  conn: PoolConnection,
  postId: number,
  actor: AuthUser,
  action: 'approve' | 'reject' | 'hide' | 'unhide' | 'reset',
  note: string | null,
): Promise<void> {
  await insert(
    'INSERT INTO review_logs (post_id, actor_id, actor_role, action, note) VALUES (?, ?, ?, ?, ?)',
    [postId, actor.row.id, actorRole(actor), action, note],
    conn,
  );
}

/** 승인 시 포인트 지급 (PT-02). 원장 주차는 리포트 대상 주차 기준 */
async function grantReportPoints(bundle: PostBundle, conn: PoolConnection): Promise<void> {
  const { post, report } = bundle;
  if (post.type !== 'report' && post.type !== 'diary') return;
  const occurredAt = post.week_key ? weekRange(post.week_key).start.toDate() : new Date();
  const points = getPointService();
  const events = [
    { ruleCode: 'REPORT_APPROVED' as const, cond: true },
    {
      ruleCode: 'REPORT_DECREASE' as const,
      cond:
        report?.diff_minutes !== null &&
        report?.diff_minutes !== undefined &&
        report.diff_minutes < 0,
    },
    {
      ruleCode: 'GOAL_CHECKED' as const,
      cond:
        report?.goal_achieved !== null &&
        report?.goal_achieved !== undefined &&
        !!report.goal_reason,
    },
  ];
  for (const e of events) {
    if (!e.cond) continue;
    try {
      await points.apply(
        {
          ruleCode: e.ruleCode,
          userId: post.author_id,
          refType: 'post',
          refId: post.id,
          occurredAt,
          eventKey: buildEventKey(e.ruleCode, 'post', post.id),
        },
        conn,
      );
    } catch (err) {
      // TODO(S4 4-1): LedgerPointService 로 교체되면 이 분기는 제거
      if (err instanceof AppError && err.code === 'NOT_IMPLEMENTED') {
        logger.warn({ postId: post.id, rule: e.ruleCode }, '포인트 엔진 미구현 — 지급 생략');
        continue;
      }
      throw err;
    }
  }
}

async function reversePostPoints(
  postId: number,
  note: string,
  actorId: number,
  conn: PoolConnection,
): Promise<void> {
  try {
    await getPointService().reverse('post', postId, { note, actorId }, conn);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_IMPLEMENTED') {
      logger.warn({ postId }, '포인트 엔진 미구현 — 회수 생략');
      return;
    }
    throw err;
  }
}

export async function transition(
  postId: number,
  action: PostAction,
  actor: AuthUser,
  opts: TransitionOptions = {},
): Promise<PostBundle> {
  return tx(async (conn) => {
    const post = await postRepo.findPostById(postId, conn, true);
    if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');

    const viewer = viewerFromAuthUser(actor);
    const isAuthor = post.author_id === actor.row.id;
    const isStudentAction = STUDENT_ACTIONS.includes(action) && actor.row.role === 'student';
    if (isStudentAction) {
      if (!isAuthor) throw AppError.forbidden('내 글만 바꿀 수 있어요.');
    } else if (TEACHER_ACTIONS.includes(action)) {
      if (!canManagePost(viewer, post))
        throw AppError.forbidden('이 반의 글을 처리할 권한이 없어요.');
    } else {
      throw AppError.forbidden();
    }

    const wasApproved = post.status === 'approved';
    const to = nextStatus(action, post.status);
    const patch: postRepo.PostPatch = {};
    let logNote: string | null = null;

    switch (action) {
      case 'submit':
      case 'resubmit':
        patch.status = 'pending';
        patch.submittedNow = true;
        patch.resetCouncilReview = true;
        patch.rejectReason = null;
        break;
      case 'approve':
        patch.status = 'approved';
        patch.approvedNow = true;
        patch.reviewedBy = actor.row.id;
        patch.reviewedNow = true;
        break;
      case 'reject':
        patch.status = 'rejected';
        patch.rejectReason = resolveRejectReason(opts);
        patch.reviewedBy = actor.row.id;
        patch.reviewedNow = true;
        logNote = patch.rejectReason;
        break;
      case 'hide':
        patch.status = 'hidden';
        patch.hiddenReason = (opts.hiddenReason ?? '').trim() || '선생님이 숨겼어요.';
        logNote = patch.hiddenReason;
        break;
      case 'unhide':
        patch.status = 'approved';
        patch.hiddenReason = null;
        break;
      case 'delete':
        patch.deletedNow = true;
        break;
    }
    void to;
    await postRepo.updatePost(post.id, patch, conn);

    if (action === 'approve' || action === 'reject' || action === 'hide' || action === 'unhide') {
      await writeReviewLog(conn, post.id, actor, action, logNote);
    }
    await writeAudit(
      {
        actorId: actor.row.id,
        action: `post.${action}`,
        targetType: 'post',
        targetId: post.id,
        payload: { from: post.status, note: logNote },
        ip: opts.ip,
      },
      conn,
    );

    const bundle = await postRepo.loadBundle(post.id, conn);
    if (!bundle) throw AppError.notFound('글을 찾을 수 없어요.');

    if (action === 'approve') await grantReportPoints(bundle, conn);
    if ((action === 'reject' || action === 'hide' || action === 'delete') && wasApproved) {
      await reversePostPoints(post.id, `post.${action}`, actor.row.id, conn);
    }
    return bundle;
  });
}

// ---------- 작성·수정 ----------

export interface ReportInput {
  type: 'report' | 'diary';
  weekKey: string;
  visibility: Visibility;
  avgMinutes: number | null;
  topCategory: string | null;
  topApp: string | null;
  body: string;
  goalText: string;
  goalAchieved: boolean | null;
  goalReason: string | null;
  submit: boolean;
}

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

export type CaptureFiles = Partial<
  Record<Extract<ImageKind, 'category_capture' | 'app_capture'>, UploadedFile>
>;

const CAPTURE_KINDS: Array<Extract<ImageKind, 'category_capture' | 'app_capture'>> = [
  'category_capture',
  'app_capture',
];

function assertCanWriteType(user: AuthUser, type: 'report' | 'diary'): void {
  if (type === 'report' && user.row.parent_consent !== 'Y') {
    // AUTH-08, 절대 규칙 5
    throw AppError.forbidden(
      '캡처 리포트는 학부모 동의가 있어야 올릴 수 있어요. "폰 없는 일주일 일기"로 써 주세요.',
    );
  }
}

async function processFiles(
  files: CaptureFiles,
): Promise<Array<{ kind: ImageKind; path: string; width: number; height: number }>> {
  const out: Array<{ kind: ImageKind; path: string; width: number; height: number }> = [];
  for (const kind of CAPTURE_KINDS) {
    const f = files[kind];
    if (!f) continue;
    if (f.size > MAX_IMAGE_BYTES)
      throw AppError.badRequest('사진이 너무 커요. 5MB 이하로 올려 주세요.');
    if (!sniffImageType(f.buffer))
      throw AppError.badRequest('jpg, png, webp 사진만 올릴 수 있어요.');
    let processed;
    try {
      processed = await processCapture(f.buffer);
    } catch {
      throw AppError.badRequest('사진을 읽을 수 없어요. 다른 사진으로 다시 올려 주세요.');
    }
    const path = await saveImage(processed);
    out.push({ kind, path, width: processed.width, height: processed.height });
  }
  return out;
}

export async function createReport(
  user: AuthUser,
  input: ReportInput,
  files: CaptureFiles,
): Promise<PostBundle> {
  if (user.row.role !== 'student' || !user.klass)
    throw AppError.forbidden('학생만 리포트를 쓸 수 있어요.');
  assertCanWriteType(user, input.type);
  if (!isAllowedWeekKey(input.weekKey))
    throw AppError.badRequest('이번 주나 지난주 리포트만 쓸 수 있어요.');
  if (input.type === 'report' && (!files.category_capture || !files.app_capture)) {
    throw AppError.badRequest('캡처 2장(카테고리·앱)을 모두 올려 주세요.');
  }
  const dup = await postRepo.findReportByAuthorWeek(user.row.id, input.weekKey);
  if (dup && !dup.deleted_at)
    throw AppError.conflict('이 주차 리포트는 이미 있어요. 그 글을 고쳐 주세요.');

  const prev = await postRepo.findPrevWeekReport(user.row.id, previousWeekKey(input.weekKey));
  const saved = input.type === 'report' ? await processFiles(files) : [];

  try {
    return await tx(async (conn) => {
      const postId = await postRepo.insertPost(
        {
          type: input.type,
          authorId: user.row.id,
          classId: user.klass?.id as number,
          grade: user.klass?.grade as number,
          status: input.submit ? 'pending' : 'draft',
          visibility: input.visibility,
          title: null,
          body: input.body,
          goalText: input.goalText,
          weekKey: input.weekKey,
          submitted: input.submit,
        },
        conn,
      );
      await postRepo.upsertReportDetails(
        postId,
        {
          avgMinutesPerDay: input.avgMinutes,
          topCategory: input.topCategory,
          topApp: input.topApp,
          prevAvgMinutes: prev?.avg_minutes_per_day ?? null,
          diffMinutes: diffMinutes(input.avgMinutes, prev?.avg_minutes_per_day ?? null),
          goalAchieved: prev ? input.goalAchieved : null,
          goalReason: prev ? input.goalReason : null,
        },
        conn,
      );
      let sort = 0;
      for (const img of saved)
        await postRepo.insertImage(postId, img.kind, img.path, img.width, img.height, sort++, conn);
      const bundle = await postRepo.loadBundle(postId, conn);
      if (!bundle) throw AppError.notFound('글을 찾을 수 없어요.');
      return bundle;
    });
  } catch (err) {
    for (const img of saved) await deleteImage(img.path);
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY')
      throw AppError.conflict('이 주차 리포트는 이미 있어요.');
    throw err;
  }
}

export type ReportUpdate = Omit<ReportInput, 'type' | 'weekKey'>;

const EDITABLE: PostStatus[] = ['draft', 'pending', 'reviewed', 'flagged', 'rejected'];

export async function updateReport(
  user: AuthUser,
  postId: number,
  input: ReportUpdate,
  files: CaptureFiles,
): Promise<PostBundle> {
  const post = await postRepo.findPostById(postId);
  if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
  if (post.author_id !== user.row.id) throw AppError.forbidden('내 글만 고칠 수 있어요.');
  if (!EDITABLE.includes(post.status))
    throw AppError.conflict('선생님이 승인한 글은 고칠 수 없어요.');
  if (post.type !== 'report' && post.type !== 'diary')
    throw AppError.badRequest('리포트가 아니에요.');
  assertCanWriteType(user, post.type);

  const prev = await postRepo.findPrevWeekReport(
    user.row.id,
    previousWeekKey(post.week_key as string),
  );
  const saved = post.type === 'report' ? await processFiles(files) : [];
  const removed: string[] = [];
  try {
    await tx(async (conn) => {
      await postRepo.updatePost(
        post.id,
        { visibility: input.visibility, body: input.body, goalText: input.goalText },
        conn,
      );
      await postRepo.upsertReportDetails(
        post.id,
        {
          avgMinutesPerDay: input.avgMinutes,
          topCategory: input.topCategory,
          topApp: input.topApp,
          prevAvgMinutes: prev?.avg_minutes_per_day ?? null,
          diffMinutes: diffMinutes(input.avgMinutes, prev?.avg_minutes_per_day ?? null),
          goalAchieved: prev ? input.goalAchieved : null,
          goalReason: prev ? input.goalReason : null,
        },
        conn,
      );
      for (const img of saved) {
        const old = await postRepo.deleteImagesByKind(post.id, img.kind, conn);
        removed.push(...old.map((o) => o.path));
        await postRepo.insertImage(
          post.id,
          img.kind,
          img.path,
          img.width,
          img.height,
          img.kind === 'category_capture' ? 0 : 1,
          conn,
        );
      }
    });
  } catch (err) {
    for (const img of saved) await deleteImage(img.path);
    throw err;
  }
  for (const p of removed) await deleteImage(p);

  if (input.submit)
    return transition(post.id, post.status === 'draft' ? 'submit' : 'resubmit', user);
  const bundle = await postRepo.loadBundle(post.id);
  if (!bundle) throw AppError.notFound('글을 찾을 수 없어요.');
  return bundle;
}

export async function getVisibleBundle(user: AuthUser, postId: number): Promise<PostBundle> {
  const bundle = await postRepo.loadBundle(postId);
  if (!bundle) throw AppError.notFound('글을 찾을 수 없어요.');
  if (!canViewPost(viewerFromAuthUser(user), bundle.post))
    throw AppError.forbidden('이 글은 볼 수 없어요.');
  return bundle;
}
