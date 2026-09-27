/**
 * 교사 댓글 모아보기·신고함 (TCH-04, 06, 07)
 *  - 범위: class(담임·배정·admin/approver) / grade / group(학년군 지도교사)
 */
import { AppError } from '../lib/apiResponse.js';
import { findBannedWords } from '../lib/bannedWords.js';
import { COMMENT_NOTICES, notify, type CommentNoticeCode } from '../lib/notify.js';
import { toTeacherCommentView } from '../lib/serializers/comment.js';
import { kst } from '../lib/time.js';
import { canAccessClass } from '../middleware/auth.js';
import { bumpCommentCount } from '../lib/reactionTarget.js';
import { writeAudit } from '../repos/auditRepo.js';
import { listActiveBannedWords } from '../repos/bannedWordRepo.js';
import * as classRepo from '../repos/classRepo.js';
import * as commentRepo from '../repos/commentRepo.js';
import * as postRepo from '../repos/postRepo.js';
import * as reportRepo from '../repos/reportRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import { advisorGrades, hasRole, type AuthUser } from '../types/auth.js';
import type { ReportItemView, TeacherCommentsPage, TeacherCommentView } from '../types/api.js';
import { transition } from './PostService.js';
import { tx } from '../db/query.js';
import { reversePointsSafe } from './points/safeApply.js';

export type CommentScope = 'class' | 'grade' | 'group';

/** 범위 → 접근 가능한 반 id 목록. 권한 밖이면 403 */
export async function resolveScopeClassIds(
  user: AuthUser,
  scope: CommentScope,
  scopeId: string,
): Promise<number[]> {
  const year = await currentSchoolYear();
  if (!year) return [];
  const all = await classRepo.listClassesByYear(year.id);
  const allowed = async (classId: number) => canAccessClass(user, classId);
  let candidates: number[];
  if (scope === 'class') {
    const id = Number(scopeId);
    if (!Number.isInteger(id)) throw AppError.badRequest('반 번호가 올바르지 않아요.');
    candidates = [id];
  } else if (scope === 'grade') {
    const g = Number(scopeId);
    candidates = all.filter((c) => c.grade === g).map((c) => c.id);
  } else {
    const grades = scopeId === '3-4' ? [3, 4] : scopeId === '5-6' ? [5, 6] : [];
    candidates = all.filter((c) => grades.includes(c.grade)).map((c) => c.id);
  }
  const ok: number[] = [];
  for (const id of candidates) if (await allowed(id)) ok.push(id);
  if (candidates.length > 0 && ok.length === 0)
    throw AppError.forbidden('이 범위의 댓글을 볼 권한이 없어요.');
  return ok;
}

/** 교사의 기본 범위: 학년군 지도교사는 group, 그 외 첫 담당 반 */
export function defaultScope(user: AuthUser): { scope: CommentScope; scopeId: string } | null {
  if (hasRole(user, 'grade_advisor') && user.row.advisor_grade_group)
    return { scope: 'group', scopeId: user.row.advisor_grade_group };
  if (user.classIds[0]) return { scope: 'class', scopeId: String(user.classIds[0]) };
  const grades = advisorGrades(user);
  if (grades.length === 4) return { scope: 'group', scopeId: '3-4' };
  return null;
}

export async function listComments(
  user: AuthUser,
  scope: CommentScope,
  scopeId: string,
  opts: { since?: string; flag?: 'reported' | 'banned' | 'all'; beforeId?: number; limit?: number },
): Promise<TeacherCommentsPage> {
  const classIds = await resolveScopeClassIds(user, scope, scopeId);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const words = await listActiveBannedWords();
  const rows = await commentRepo.listCommentsForTeacher({
    classIds,
    since: opts.since,
    flag: opts.flag === 'reported' ? 'reported' : 'all',
    beforeId: opts.beforeId,
    limit: opts.flag === 'banned' ? 500 : limit + 1,
  });
  let views = rows.map((r) => toTeacherCommentView(r, findBannedWords(r.body, words)));
  let total: number;
  if (opts.flag === 'banned') {
    views = views.filter((v) => v.bannedHits.length > 0);
    total = views.length;
    views = views.slice(0, limit + 1);
  } else {
    total = await commentRepo.countCommentsForTeacher({
      classIds,
      since: opts.since,
      flag: opts.flag === 'reported' ? 'reported' : 'all',
    });
  }
  const page = views.slice(0, limit);
  const last = page[page.length - 1];

  const todayStart = kst().startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const lastCheck = await commentRepo.lastCommentCheck(scope, scopeId);
  const sinceCheck = lastCheck
    ? kst(lastCheck.checked_at).format('YYYY-MM-DD HH:mm:ss.SSS')
    : '1970-01-01 00:00:00';
  return {
    scope,
    scopeId,
    items: page,
    nextCursor: views.length > limit && last ? String(last.id) : null,
    total,
    counts: {
      today: await commentRepo.countCommentsSince(classIds, todayStart),
      unchecked: await commentRepo.countCommentsSince(classIds, sinceCheck),
      lastCheckedAt: lastCheck ? lastCheck.checked_at.toISOString() : null,
      lastCheckedBy: lastCheck?.teacher_name ?? null,
    },
  };
}

/** 교사용 글 상세 댓글 (QA #2): 숨긴 댓글 포함, 실명 */
export async function listCommentsOfPost(postId: number): Promise<TeacherCommentView[]> {
  const words = await listActiveBannedWords();
  const rows = await commentRepo.listCommentsByTargetForTeacher('post', postId);
  return rows.map((r) => toTeacherCommentView(r, findBannedWords(r.body, words)));
}

async function assertCommentManageable(
  user: AuthUser,
  commentId: number,
): Promise<commentRepo.CommentBundle> {
  const c = await commentRepo.findComment(commentId);
  if (!c || c.comment.status === 'deleted') throw AppError.notFound('댓글을 찾을 수 없어요.');
  if (!c.author.class_id || !(await canAccessClass(user, c.author.class_id)))
    throw AppError.forbidden('이 학생의 댓글을 처리할 권한이 없어요.');
  return c;
}

export async function hideComment(
  user: AuthUser,
  commentId: number,
  reasonRaw: string | undefined,
  ip?: string,
): Promise<void> {
  const c = await assertCommentManageable(user, commentId);
  const reason = (reasonRaw ?? '').trim() || COMMENT_NOTICES.hidden;
  await tx(async (conn) => {
    await commentRepo.setCommentStatus(commentId, 'hidden', user.row.id, reason, conn);
    if (c.comment.status === 'visible')
      await bumpCommentCount(c.comment.target_type, c.comment.target_id, -1, conn);
    await reportRepo.settleReports('comment', commentId, 'hidden', user.row.id, conn);
    await reversePointsSafe(
      'comment',
      commentId,
      { note: 'comment.hide', actorId: user.row.id },
      conn,
    );
    await notify(
      c.comment.author_id,
      'comment_hidden',
      { message: `선생님이 댓글을 숨겼어요. ${reason}` },
      conn,
    );
    await writeAudit(
      {
        actorId: user.row.id,
        action: 'comment.hide',
        targetType: 'comment',
        targetId: commentId,
        payload: { reason },
        ip,
      },
      conn,
    );
  });
}

export async function unhideComment(user: AuthUser, commentId: number, ip?: string): Promise<void> {
  const c = await assertCommentManageable(user, commentId);
  if (c.comment.status !== 'hidden') throw AppError.conflict('숨긴 댓글만 다시 보일 수 있어요.');
  await tx(async (conn) => {
    await commentRepo.setCommentStatus(commentId, 'visible', null, null, conn);
    await bumpCommentCount(c.comment.target_type, c.comment.target_id, 1, conn);
    await reportRepo.settleReports('comment', commentId, 'kept', user.row.id, conn);
    await writeAudit(
      {
        actorId: user.row.id,
        action: 'comment.unhide',
        targetType: 'comment',
        targetId: commentId,
        ip,
      },
      conn,
    );
  });
}

export async function notifyCommentAuthor(
  user: AuthUser,
  commentId: number,
  code: CommentNoticeCode,
  ip?: string,
): Promise<void> {
  const c = await assertCommentManageable(user, commentId);
  const message = COMMENT_NOTICES[code];
  await notify(c.comment.author_id, 'comment_notice', {
    message: `선생님 안내: ${message}`,
    commentId,
  });
  await writeAudit({
    actorId: user.row.id,
    action: 'comment.notify',
    targetType: 'comment',
    targetId: commentId,
    payload: { code },
    ip,
  });
}

export async function markChecked(
  user: AuthUser,
  scope: CommentScope,
  scopeId: string,
): Promise<void> {
  await resolveScopeClassIds(user, scope, scopeId);
  await commentRepo.insertCommentCheck(user.row.id, scope, scopeId);
}

// ---------- 신고함 (TCH-04) ----------

async function accessibleClassIds(user: AuthUser): Promise<number[]> {
  const year = await currentSchoolYear();
  if (!year) return [];
  const all = await classRepo.listClassesByYear(year.id);
  const ok: number[] = [];
  for (const c of all) if (await canAccessClass(user, c.id)) ok.push(c.id);
  return ok;
}

/** 신고 행 → 대상 종류 (링크·라벨용) */
export function reportTargetKind(r: {
  target_type: string;
  comment_target_type: string | null;
}): ReportItemView['targetKind'] {
  if (r.target_type === 'post') return 'post';
  if (r.comment_target_type === 'news_topic') return 'news_comment';
  if (r.comment_target_type === 'council_post') return 'council_comment';
  return 'post_comment';
}

/**
 * 신고함 목록 (TCH-04). 같은 대상(글/댓글)에 대한 신고는 카드 1장으로 묶는다 (QA #4).
 * 처리 상태가 같은 것끼리 묶이므로 "처리 전" 그룹과 "처리됨" 그룹이 따로 나온다.
 */
export async function listReports(
  user: AuthUser,
  status: 'open' | 'all',
): Promise<ReportItemView[]> {
  const classIds = await accessibleClassIds(user);
  const rows = await reportRepo.listReportsForClasses(classIds, status === 'all' ? 'all' : 'open');
  const groups = new Map<string, ReportItemView>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}:${r.status}`;
    const entry = {
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at.toISOString(),
      reporter: { displayName: r.reporter_display, className: r.reporter_class },
    };
    const g = groups.get(key);
    if (g) {
      g.reports.push(entry);
      if (entry.createdAt > g.latestAt) g.latestAt = entry.createdAt;
      continue;
    }
    groups.set(key, {
      id: r.id,
      key,
      targetType: r.target_type === 'post' ? 'post' : 'comment',
      targetId: r.target_id,
      targetKind: reportTargetKind(r),
      postId: r.target_post_id,
      commentId: r.target_type === 'comment' ? r.target_id : null,
      status: r.status,
      latestAt: entry.createdAt,
      reportCount: r.status === 'open' ? Number(r.report_count) : 1,
      reports: [entry],
      target: {
        preview: r.target_preview,
        status: r.target_status,
        authorName: r.target_author_name,
        className: r.target_class_name,
        postType: r.post_type,
      },
    });
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.reports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (g.status !== 'open')
      g.reportCount = new Set(g.reports.map((x) => x.reporter.displayName)).size;
  }
  return out.sort(
    (a, b) =>
      Number(b.status === 'open') - Number(a.status === 'open') ||
      (a.latestAt < b.latestAt ? 1 : -1),
  );
}

export type ReportAction = 'keep' | 'hide' | 'delete';

export async function handleReport(
  user: AuthUser,
  reportId: number,
  action: ReportAction,
  ip?: string,
): Promise<void> {
  const r = await reportRepo.findReport(reportId);
  if (!r) throw AppError.notFound('신고를 찾을 수 없어요.');
  if (r.target_type === 'post') {
    const post = await postRepo.findPostById(r.target_id);
    if (!post) throw AppError.notFound('글을 찾을 수 없어요.');
    if (!(await canAccessClass(user, post.class_id)))
      throw AppError.forbidden('이 반의 글을 처리할 권한이 없어요.');
    if (action === 'hide' && post.status === 'approved')
      await transition(post.id, 'hide', user, { hiddenReason: '신고 내용을 확인해 숨겼어요.', ip });
    if (action === 'delete' && !post.deleted_at) await transition(post.id, 'delete', user, { ip });
    if (action === 'keep' && post.status === 'hidden')
      await transition(post.id, 'unhide', user, { ip });
    await reportRepo.settleReports(
      'post',
      post.id,
      action === 'keep' ? 'kept' : action === 'hide' ? 'hidden' : 'deleted',
      user.row.id,
    );
  } else {
    const c = await assertCommentManageable(user, r.target_id).catch(() => null);
    if (!c) throw AppError.notFound('댓글을 찾을 수 없어요.');
    if (action === 'keep') {
      if (c.comment.status === 'hidden') await unhideComment(user, c.comment.id, ip);
      else await reportRepo.settleReports('comment', c.comment.id, 'kept', user.row.id);
    } else if (action === 'hide') {
      if (c.comment.status !== 'hidden')
        await hideComment(user, c.comment.id, '신고 내용을 확인해 숨겼어요.', ip);
      else await reportRepo.settleReports('comment', c.comment.id, 'hidden', user.row.id);
    } else {
      await tx(async (conn) => {
        await commentRepo.setCommentStatus(
          c.comment.id,
          'deleted',
          user.row.id,
          '선생님이 삭제했어요.',
          conn,
        );
        if (c.comment.status === 'visible')
          await bumpCommentCount(c.comment.target_type, c.comment.target_id, -1, conn);
        await reportRepo.settleReports('comment', c.comment.id, 'deleted', user.row.id, conn);
        await reversePointsSafe(
          'comment',
          c.comment.id,
          { note: 'comment.delete_by_teacher', actorId: user.row.id },
          conn,
        );
      });
    }
  }
  await writeAudit({
    actorId: user.row.id,
    action: `report.${action}`,
    targetType: 'report',
    targetId: reportId,
    ip,
  });
}
