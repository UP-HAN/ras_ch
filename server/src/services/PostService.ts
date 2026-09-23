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
import { ARTICLE_LIMITS, validateArticle } from '../lib/articleRules.js';
import { notify } from '../lib/notify.js';
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
import { hasRole, type AuthUser } from '../types/auth.js';
import type { ImageKind, PostStatus, Visibility } from '../types/db.js';
import { applyPointsSafe, reversePointsSafe } from './points/safeApply.js';
import { buildEventKey, type RuleCode } from './points/types.js';

export type PostAction =
  | 'submit'
  | 'resubmit'
  | 'review_pass'
  | 'review_hold'
  | 'approve'
  | 'reject'
  | 'hide'
  | 'unhide'
  | 'delete';

/** 허용 전이표. delete 는 소프트 삭제(상태 유지). review_* 는 자치회 1차 검토(APR-04) */
export const TRANSITIONS: Record<PostAction, { from: PostStatus[]; to: PostStatus | 'same' }> = {
  submit: { from: ['draft'], to: 'pending' },
  resubmit: { from: ['draft', 'pending', 'reviewed', 'flagged', 'rejected'], to: 'pending' },
  review_pass: { from: ['pending'], to: 'reviewed' },
  review_hold: { from: ['pending'], to: 'flagged' },
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
/** 임원 학생(council)·교사 검토 계정(council_teacher)만. 대상 검증(본인·같은 반 제외)은 ReviewService */
export const COUNCIL_ACTIONS: PostAction[] = ['review_pass', 'review_hold'];

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
  /** review_pass / review_hold: 체크리스트(코드→확인) + 메모(보류는 20자 이상, ReviewService 검사) */
  checklist?: Record<string, boolean>;
  note?: string | null;
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

/** 신고 3회 자동 숨김 등 시스템이 실행하는 전이 (RCT-05) */
export type SystemActor = 'system';
export type TransitionActor = AuthUser | SystemActor;

const actorRole = (
  u: TransitionActor,
): 'teacher' | 'admin' | 'council' | 'council_teacher' | 'system' =>
  u === 'system'
    ? 'system'
    : u.row.role === 'admin'
      ? 'admin'
      : u.row.role === 'council_teacher'
        ? 'council_teacher'
        : u.row.role === 'teacher'
          ? 'teacher'
          : 'council';

const actorId = (u: TransitionActor): number | null => (u === 'system' ? null : u.row.id);

async function writeReviewLog(
  conn: PoolConnection,
  postId: number,
  actor: TransitionActor,
  action: 'pass' | 'hold' | 'approve' | 'reject' | 'hide' | 'unhide' | 'reset',
  note: string | null,
  checklist: Record<string, boolean> | null = null,
): Promise<void> {
  await insert(
    'INSERT INTO review_logs (post_id, actor_id, actor_role, action, checklist, note) VALUES (?, ?, ?, ?, ?, ?)',
    [
      postId,
      actorId(actor),
      actorRole(actor),
      action,
      checklist ? JSON.stringify(checklist) : null,
      note,
    ],
    conn,
  );
}

const REVIEW_LOG_ACTION: Partial<
  Record<PostAction, 'pass' | 'hold' | 'approve' | 'reject' | 'hide' | 'unhide'>
> = {
  review_pass: 'pass',
  review_hold: 'hold',
  approve: 'approve',
  reject: 'reject',
  hide: 'hide',
  unhide: 'unhide',
};

/** 승인 시 포인트 지급 (PT-02). 리포트는 대상 주차 기준, 기사는 승인 시각 기준 */
/** 승인 시 지급 (PT-02). 리빌드(PT-08)도 이 함수를 그대로 써서 산식이 한 곳에만 있게 한다 */
export async function grantApprovalPoints(
  bundle: PostBundle,
  conn: PoolConnection,
  note?: string,
): Promise<number> {
  let granted = 0;
  const { post, report, author } = bundle;
  const events: Array<{ ruleCode: RuleCode; cond: boolean }> = [];
  let occurredAt = new Date();
  if (post.type === 'report' || post.type === 'diary') {
    occurredAt = post.week_key ? weekRange(post.week_key).start.toDate() : new Date();
    events.push(
      { ruleCode: 'REPORT_APPROVED', cond: true },
      {
        ruleCode: 'REPORT_DECREASE',
        cond:
          report?.diff_minutes !== null &&
          report?.diff_minutes !== undefined &&
          report.diff_minutes < 0,
      },
      {
        ruleCode: 'GOAL_CHECKED',
        cond:
          report?.goal_achieved !== null &&
          report?.goal_achieved !== undefined &&
          !!report.goal_reason,
      },
    );
  } else if (post.type === 'article') {
    events.push(
      { ruleCode: 'ARTICLE_APPROVED', cond: true },
      { ruleCode: 'REPORTER_BONUS', cond: author.is_reporter === 1 }, // ART-07
    );
  }
  for (const e of events) {
    if (!e.cond) continue;
    const r = await applyPointsSafe(
      {
        ruleCode: e.ruleCode,
        userId: post.author_id,
        refType: 'post',
        refId: post.id,
        occurredAt,
        note,
        eventKey: buildEventKey(e.ruleCode, 'post', post.id),
      },
      conn,
    );
    if (r.granted) granted += 1;
  }
  return granted;
}

const TYPE_LABEL: Record<string, string> = { report: '리포트', diary: '일기', article: '기사' };

/** 작성자에게 인앱 알림 (CMN-03). 본인이 한 일에는 보내지 않는다 */
async function notifyAuthor(
  conn: PoolConnection,
  bundle: PostBundle,
  action: PostAction,
  actor: TransitionActor,
  note: string | null,
): Promise<void> {
  const { post } = bundle;
  if (actor !== 'system' && actor.row.id === post.author_id) return;
  const label = TYPE_LABEL[post.type] ?? '글';
  const link = `/posts/${post.id}`;
  if (action === 'approve') {
    await notify(
      post.author_id,
      'post_approved',
      { message: `${label}가 게시됐어요! 잘했어요.`, link, postId: post.id },
      conn,
    );
  } else if (action === 'reject') {
    await notify(
      post.author_id,
      'post_rejected',
      {
        message: `${label}를 고쳐서 다시 보내 주세요. ${note ?? ''}`.trim(),
        link,
        postId: post.id,
      },
      conn,
    );
  } else if (action === 'hide') {
    await notify(
      post.author_id,
      'post_hidden',
      { message: `${label}가 숨겨졌어요. ${note ?? ''}`.trim(), link, postId: post.id },
      conn,
    );
  }
}

export async function transition(
  postId: number,
  action: PostAction,
  actor: TransitionActor,
  opts: TransitionOptions = {},
): Promise<PostBundle> {
  return tx(async (conn) => {
    const post = await postRepo.findPostById(postId, conn, true);
    if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');

    if (actor === 'system') {
      if (action !== 'hide') throw AppError.forbidden();
    } else {
      const viewer = viewerFromAuthUser(actor);
      const isAuthor = post.author_id === actor.row.id;
      const isStudentAction = STUDENT_ACTIONS.includes(action) && actor.row.role === 'student';
      if (isStudentAction) {
        if (!isAuthor) throw AppError.forbidden('내 글만 바꿀 수 있어요.');
      } else if (COUNCIL_ACTIONS.includes(action)) {
        if (!hasRole(actor, 'council') && !hasRole(actor, 'council_teacher'))
          throw AppError.forbidden('검토 권한이 없어요.');
        if (isAuthor) throw AppError.forbidden('내 글은 검토할 수 없어요.');
        if (actor.row.role === 'student' && actor.row.class_id === post.class_id)
          throw AppError.forbidden('같은 반 글은 검토할 수 없어요.');
      } else if (TEACHER_ACTIONS.includes(action)) {
        if (!canManagePost(viewer, post))
          throw AppError.forbidden('이 반의 글을 처리할 권한이 없어요.');
      } else {
        throw AppError.forbidden();
      }
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
      case 'review_pass':
      case 'review_hold':
        patch.status = action === 'review_pass' ? 'reviewed' : 'flagged';
        patch.councilReviewerId = actorId(actor);
        patch.councilResult = action === 'review_pass' ? 'pass' : 'hold';
        patch.councilChecklist = opts.checklist ?? {};
        patch.councilNote = opts.note ?? null;
        patch.councilReviewedNow = true;
        logNote = opts.note ?? null;
        break;
      case 'approve':
        patch.status = 'approved';
        patch.approvedNow = true;
        patch.reviewedBy = actorId(actor);
        patch.reviewedNow = true;
        break;
      case 'reject':
        patch.status = 'rejected';
        patch.rejectReason = resolveRejectReason(opts);
        patch.reviewedBy = actorId(actor);
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

    const logAction = REVIEW_LOG_ACTION[action];
    if (logAction) {
      await writeReviewLog(conn, post.id, actor, logAction, logNote, opts.checklist ?? null);
    }
    await writeAudit(
      {
        actorId: actorId(actor),
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

    // 승인 시 지급, 숨김 해제 시 재지급(숨김 때 회수됐으므로; event_key 세대 규칙으로 멱등) (RPT-06, PT-03)
    if (action === 'approve' || action === 'unhide') await grantApprovalPoints(bundle, conn);
    if ((action === 'reject' || action === 'hide' || action === 'delete') && wasApproved) {
      await reversePointsSafe(
        'post',
        post.id,
        { note: `post.${action}`, actorId: actorId(actor) ?? undefined },
        conn,
      );
    }
    await notifyAuthor(conn, bundle, action, actor, logNote);
    return bundle;
  });
}

// ---------- 기사 (ART-01, 02, 03, 07) ----------

export interface ArticleWriteInput {
  title: string;
  tags: string[];
  articleType: string;
  body: string;
  oneLine: string | null;
  submit: boolean;
}

async function processPhotos(
  files: UploadedFile[],
): Promise<Array<{ path: string; width: number; height: number }>> {
  if (files.length > ARTICLE_LIMITS.photosMax)
    throw AppError.badRequest(`사진은 ${ARTICLE_LIMITS.photosMax}장까지만 올릴 수 있어요.`);
  const out: Array<{ path: string; width: number; height: number }> = [];
  for (const f of files) {
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
    out.push({
      path: await saveImage(processed),
      width: processed.width,
      height: processed.height,
    });
  }
  return out;
}

export async function createArticle(
  user: AuthUser,
  input: ArticleWriteInput,
  files: UploadedFile[],
): Promise<PostBundle> {
  if (user.row.role !== 'student' || !user.klass)
    throw AppError.forbidden('학생만 기사를 쓸 수 있어요.');
  const problem = validateArticle(input);
  if (problem) throw AppError.badRequest(problem);
  const saved = await processPhotos(files);
  try {
    return await tx(async (conn) => {
      const postId = await postRepo.insertPost(
        {
          type: 'article',
          authorId: user.row.id,
          classId: user.klass?.id as number,
          grade: user.klass?.grade as number,
          status: input.submit ? 'pending' : 'draft',
          visibility: 'school',
          title: input.title.trim(),
          body: input.body.trim(),
          goalText: null,
          weekKey: null,
          submitted: input.submit,
        },
        conn,
      );
      await postRepo.upsertArticleDetails(
        postId,
        {
          articleType: input.articleType,
          tags: [...new Set(input.tags)],
          oneLine: input.oneLine?.trim() || null,
        },
        conn,
      );
      let sort = 0;
      for (const img of saved)
        await postRepo.insertImage(postId, 'photo', img.path, img.width, img.height, sort++, conn);
      const bundle = await postRepo.loadBundle(postId, conn);
      if (!bundle) throw AppError.notFound('글을 찾을 수 없어요.');
      return bundle;
    });
  } catch (err) {
    for (const img of saved) await deleteImage(img.path);
    throw err;
  }
}

/** 승인 전 본인 수정. 사진을 새로 올리면 기존 사진을 모두 교체한다 */
export async function updateArticle(
  user: AuthUser,
  postId: number,
  input: ArticleWriteInput,
  files: UploadedFile[],
): Promise<PostBundle> {
  const post = await postRepo.findPostById(postId);
  if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
  if (post.author_id !== user.row.id) throw AppError.forbidden('내 글만 고칠 수 있어요.');
  if (!EDITABLE.includes(post.status))
    throw AppError.conflict('선생님이 승인한 글은 고칠 수 없어요.');
  if (post.type !== 'article') throw AppError.badRequest('기사가 아니에요.');
  const problem = validateArticle(input);
  if (problem) throw AppError.badRequest(problem);
  const saved = await processPhotos(files);
  const removed: string[] = [];
  try {
    await tx(async (conn) => {
      await postRepo.updatePost(
        post.id,
        { title: input.title.trim(), body: input.body.trim() },
        conn,
      );
      await postRepo.upsertArticleDetails(
        post.id,
        {
          articleType: input.articleType,
          tags: [...new Set(input.tags)],
          oneLine: input.oneLine?.trim() || null,
        },
        conn,
      );
      if (saved.length > 0) {
        const old = await postRepo.deleteImagesByKind(post.id, 'photo', conn);
        removed.push(...old.map((o) => o.path));
        let sort = 0;
        for (const img of saved)
          await postRepo.insertImage(
            post.id,
            'photo',
            img.path,
            img.width,
            img.height,
            sort++,
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

export const EDITABLE: PostStatus[] = ['draft', 'pending', 'reviewed', 'flagged', 'rejected'];

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
