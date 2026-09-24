/**
 * 1차 검토 (APR-02, 02a, 02c, 03, 04, 06, 09, 12, 14, 15) — 자치회 임원 학생·교사 검토 계정
 *  - 큐는 SQL 에서 본인·같은 반·teacher_only 반을 제외하고, 응답은 toReviewerPostView(작성자 식별 0개)
 *  - 결과는 transition('review_pass'|'review_hold') 한 곳으로
 *  - 학생 검토자만 REVIEW_DONE, 교사 검토 계정은 미지급. APR-14 자동 2차 승인
 */
import { query } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import {
  CHECKLISTS,
  expandPostTypes,
  HOLD_REASONS,
  holdNoteValid,
  resultAllowed,
  REVIEW_GUIDE_DEFAULT,
  reviewQueueFilter,
  type ReviewerContext,
} from '../lib/reviewRules.js';
import { toReviewerPostView } from '../lib/serializers/post.js';
import { kst } from '../lib/time.js';
import { resolveAllClasses } from '../repos/approvalSettingsRepo.js';
import * as classRepo from '../repos/classRepo.js';
import * as postRepo from '../repos/postRepo.js';
import * as reviewRepo from '../repos/reviewRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import { getSetting } from '../repos/settingsRepo.js';
import { loadAuthUser } from '../repos/userRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { ReviewQueueItem, ReviewSummaryView } from '../types/api.js';
import type { PostRow } from '../types/db.js';
import { applyPointsSafe } from './points/safeApply.js';
import { evaluateSafe as evaluateAchievements } from './AchievementService.js';
import { buildEventKey } from './points/types.js';
import { transition } from './PostService.js';
import { queryOne } from '../db/query.js';

function isReviewer(user: AuthUser): boolean {
  return (user.row.role === 'student' && user.isCouncil) || user.row.role === 'council_teacher';
}

async function contextFor(
  user: AuthUser,
): Promise<{ ctx: ReviewerContext; assignment: reviewRepo.AssignmentRow }> {
  if (!isReviewer(user)) throw AppError.forbidden('검토 권한이 없어요.');
  const assignment = await reviewRepo.activeAssignmentFor(user.row.id);
  if (!assignment)
    throw AppError.forbidden('검토 담당으로 지정되지 않았어요. 선생님께 물어보세요.');
  return {
    assignment,
    ctx: {
      id: user.row.id,
      kind: user.row.role === 'student' ? 'student' : 'teacher',
      classId: user.row.class_id,
      grades: assignment.grades,
      postTypes: assignment.post_types,
    },
  };
}

/** teacher_only 모드인 반 id 집합 (APR-06) */
async function teacherOnlyClassIds(): Promise<Set<number>> {
  const year = await currentSchoolYear();
  if (!year) return new Set();
  const classes = await classRepo.listClassesByYear(year.id);
  const resolved = await resolveAllClasses(classes.map((c) => ({ id: c.id, grade: c.grade })));
  return new Set(
    [...resolved.entries()].filter(([, v]) => v.mode === 'teacher_only').map(([id]) => id),
  );
}

function checklistFor(type: PostRow['type']) {
  return type === 'article' ? CHECKLISTS.article : CHECKLISTS.report;
}

/** 임원 학생이 이 글(이미지 포함)을 검토 목적으로 볼 수 있는가 — 큐 조건과 동일 (APR-02c, 이미지 라우트용) */
export async function canReviewPost(user: AuthUser, post: PostRow): Promise<boolean> {
  if (!isReviewer(user)) return false;
  const assignment = await reviewRepo.activeAssignmentFor(user.row.id);
  if (!assignment) return false;
  const modes = await resolveAllClasses([{ id: post.class_id, grade: post.grade }]);
  return reviewQueueFilter(
    {
      id: user.row.id,
      kind: user.row.role === 'student' ? 'student' : 'teacher',
      classId: user.row.class_id,
      grades: assignment.grades,
      postTypes: assignment.post_types,
    },
    post,
    modes.get(post.class_id)?.mode ?? 'two_step',
  );
}

export async function reviewQueue(user: AuthUser): Promise<ReviewQueueItem[]> {
  const { ctx } = await contextFor(user);
  const types = expandPostTypes(ctx.postTypes);
  if (types.length === 0 || ctx.grades.length === 0) return [];
  const excludeClasses = await teacherOnlyClassIds();
  const where: string[] = ["p.status = 'pending'", 'p.deleted_at IS NULL'];
  const params: unknown[] = [];
  where.push(`p.grade IN (${ctx.grades.map(() => '?').join(',')})`);
  params.push(...ctx.grades);
  where.push(`p.type IN (${types.map(() => '?').join(',')})`);
  params.push(...types);
  if (ctx.kind === 'student') {
    where.push('p.author_id <> ?');
    params.push(ctx.id);
    if (ctx.classId !== null) {
      where.push('p.class_id <> ?');
      params.push(ctx.classId);
    }
  }
  if (excludeClasses.size > 0) {
    where.push(`p.class_id NOT IN (${[...excludeClasses].map(() => '?').join(',')})`);
    params.push(...excludeClasses);
  }
  const rows = await query<{ id: number }>(
    `SELECT p.id FROM posts p WHERE ${where.join(' AND ')} ORDER BY p.submitted_at ASC, p.id ASC LIMIT 100`,
    params,
  );
  const bundles = await postRepo.loadBundles(rows.map((r) => r.id));
  bundles.sort(
    (a, b) =>
      (a.post.submitted_at?.getTime() ?? 0) - (b.post.submitted_at?.getTime() ?? 0) ||
      a.post.id - b.post.id,
  );
  return bundles.map((b) => ({ ...toReviewerPostView(b), checklist: checklistFor(b.post.type) }));
}

export async function reviewPost(user: AuthUser, postId: number): Promise<ReviewQueueItem> {
  const { ctx } = await contextFor(user);
  const bundle = await postRepo.loadBundle(postId);
  if (!bundle || bundle.post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
  const modes = await resolveAllClasses([{ id: bundle.post.class_id, grade: bundle.post.grade }]);
  const mode = modes.get(bundle.post.class_id)?.mode ?? 'two_step';
  if (!reviewQueueFilter(ctx, bundle.post, mode))
    throw AppError.forbidden('이 글은 검토 대상이 아니에요.');
  return { ...toReviewerPostView(bundle), checklist: checklistFor(bundle.post.type) };
}

export async function reviewSummary(user: AuthUser): Promise<ReviewSummaryView> {
  const guide = await getSetting('review_guide', REVIEW_GUIDE_DEFAULT);
  const holdReasons = HOLD_REASONS.map((h) => ({ code: h.code, text: h.text }));
  if (!isReviewer(user))
    return {
      hasAssignment: false,
      pending: 0,
      doneToday: 0,
      dailyCap: 0,
      allowedResults: null,
      grades: [],
      postTypes: [],
      guide,
      holdReasons,
    };
  const assignment = await reviewRepo.activeAssignmentFor(user.row.id);
  if (!assignment)
    return {
      hasAssignment: false,
      pending: 0,
      doneToday: 0,
      dailyCap: 0,
      allowedResults: null,
      grades: [],
      postTypes: [],
      guide,
      holdReasons,
    };
  const pending = (await reviewQueue(user)).length;
  const doneToday = await reviewRepo.countReviewsToday(
    user.row.id,
    kst().startOf('day').format('YYYY-MM-DD HH:mm:ss'),
  );
  return {
    hasAssignment: true,
    pending,
    doneToday,
    dailyCap: assignment.daily_cap,
    allowedResults: assignment.allowed_results,
    grades: assignment.grades,
    postTypes: assignment.post_types,
    guide,
    holdReasons,
  };
}

export interface ReviewInput {
  result: 'pass' | 'hold';
  checklist: Record<string, boolean>;
  note?: string;
}

export async function submitReview(
  user: AuthUser,
  postId: number,
  input: ReviewInput,
  ip?: string,
): Promise<{ status: string; autoApproved: boolean }> {
  const { ctx, assignment } = await contextFor(user);
  if (!resultAllowed(assignment.allowed_results, input.result))
    throw AppError.forbidden('보류 요청 권한이 없어요. 통과만 할 수 있어요.');
  if (input.result === 'hold' && !holdNoteValid(input.note))
    throw AppError.badRequest('보류 이유를 20자 이상 적어 주세요.');
  const doneToday = await reviewRepo.countReviewsToday(
    user.row.id,
    kst().startOf('day').format('YYYY-MM-DD HH:mm:ss'),
  );
  if (doneToday >= assignment.daily_cap)
    throw AppError.conflict(
      `오늘 검토 ${assignment.daily_cap}건을 다 했어요. 내일 다시 해 주세요.`,
    );

  const post = await postRepo.findPostById(postId);
  if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
  const modes = await resolveAllClasses([{ id: post.class_id, grade: post.grade }]);
  if (!reviewQueueFilter(ctx, post, modes.get(post.class_id)?.mode ?? 'two_step'))
    throw AppError.forbidden('이 글은 검토 대상이 아니에요.');

  // 체크리스트는 정의된 코드만 저장
  const allowedCodes = new Set(checklistFor(post.type).map((c) => c.code));
  const checklist: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input.checklist ?? {}))
    if (allowedCodes.has(k)) checklist[k] = v === true;
  if (input.result === 'pass' && [...allowedCodes].some((c) => checklist[c] !== true)) {
    throw AppError.badRequest(
      '통과하려면 체크리스트를 모두 확인해야 해요. 하나라도 아니면 보류 요청을 눌러요.',
    );
  }

  const bundle = await transition(
    postId,
    input.result === 'pass' ? 'review_pass' : 'review_hold',
    user,
    {
      checklist,
      note: input.note?.trim() || null,
      ip,
    },
  );

  // APR-09·15: 학생 검토자만 REVIEW_DONE(일 10)
  if (user.row.role === 'student') {
    await applyPointsSafe({
      ruleCode: 'REVIEW_DONE',
      userId: user.row.id,
      // 근거는 'review'(글 id) — 글 회수(ref 'post') 때 검토자 포인트가 같이 회수되지 않도록 분리
      refType: 'review',
      refId: postId,
      eventKey: `${buildEventKey('REVIEW_DONE', 'review', postId)}:${user.row.id}`,
    });
    await evaluateAchievements(user.row.id); // 검토 도우미
  }

  // APR-14: 교사 검토 계정 통과 + 반 설정 켜짐 + 그 교사가 담당 반 → 자동 2차 승인
  let autoApproved = false;
  if (input.result === 'pass' && user.row.role === 'council_teacher') {
    const setting = modes.get(post.class_id);
    if (setting?.autoApproveTeacherReview) {
      const owner = await queryOne<{ id: number }>(
        'SELECT id FROM users WHERE linked_council_account_id = ? LIMIT 1',
        [user.row.id],
      );
      const teacher = owner ? await loadAuthUser(owner.id) : null;
      if (teacher) {
        try {
          await transition(postId, 'approve', teacher, { ip });
          autoApproved = true;
        } catch {
          // 담당 반이 아니면 자동 승인하지 않고 교사 대기함으로
        }
      }
    }
  }
  return { status: autoApproved ? 'approved' : bundle.post.status, autoApproved };
}
