/**
 * 교사 API (AUTH-04, AUTH-07, TCH-03 일부). 반 단위 접근은 requireClassAccess 로 검사.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/query.js';
import { AppError, ok } from '../lib/apiResponse.js';
import { toTeacherPostView } from '../lib/serializers/post.js';
import { toTeacherUser } from '../lib/serializers/user.js';
import { resolveAllClasses, resolveApproval } from '../repos/approvalSettingsRepo.js';
import * as postRepo from '../repos/postRepo.js';
import { listReviewLogs } from '../repos/reviewRepo.js';
import { teacherBonus } from '../services/PointsQueryService.js';
import { classDashboard, classStatsCsv } from '../services/StatsService.js';
import { closedTopicsForTeacher, selectBest } from '../services/NewsService.js';
import { sendCsv } from '../lib/csvWrite.js';
import { transition } from '../services/PostService.js';
import * as tc from '../services/TeacherCommentService.js';
import type {
  BulkApproveResult,
  PendingCounts,
  PendingQueueView,
  ReviewLogView,
} from '../types/api.js';
import type { PostStatus, PostType } from '../types/db.js';
import {
  canAccessClass,
  clientIp,
  currentUser,
  requireClassAccess,
  requireRole,
} from '../middleware/auth.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as classRepo from '../repos/classRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import * as userRepo from '../repos/userRepo.js';
import { getAuthService } from '../services/AuthService.js';
import type { ClassView, ResetPasswordResult } from '../types/api.js';
import { advisorGrades, hasRole } from '../types/auth.js';

export function createTeacherRouter(): Router {
  const router = Router();
  router.use(requireRole('teacher'));

  /** 내가 볼 수 있는 반: admin·approver 는 전체, 학년군 지도교사는 담당 학년, 그 외 담임·배정 반 */
  router.get('/classes', async (req, res) => {
    const user = currentUser(req);
    const year = await currentSchoolYear();
    if (!year) return res.json(ok([]));
    const all = await classRepo.listClassesByYear(year.id);
    const grades = advisorGrades(user);
    const visible = all.filter(
      (c) =>
        hasRole(user, 'admin') ||
        hasRole(user, 'approver') ||
        user.classIds.includes(c.id) ||
        grades.includes(c.grade),
    );
    const data: ClassView[] = visible.map((c) => ({
      id: c.id,
      grade: c.grade,
      classNo: c.class_no,
      name: c.name,
      homeroomTeacherId: c.homeroom_teacher_id,
      homeroomTeacherName: c.homeroom_teacher_name,
      teacherIds: c.teacher_ids,
      studentCount: Number(c.student_count),
    }));
    res.json(ok(data));
  });

  // TCH-01 반 대시보드 / TCH-05 반 통계 CSV
  router.get('/classes/:id/dashboard', requireClassAccess('id'), async (req, res) => {
    res.json(ok(await classDashboard(Number(req.params.id))));
  });
  router.get('/classes/:id/export.csv', requireClassAccess('id'), async (req, res) => {
    const { filename, rows } = await classStatsCsv(Number(req.params.id));
    sendCsv(res, filename, rows);
  });

  router.get('/classes/:id/students', requireClassAccess('id'), async (req, res) => {
    const classId = Number(req.params.id);
    const klass = await classRepo.findClassById(classId);
    if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
    const rows = await userRepo.listStudentsByClass(classId);
    res.json(ok(rows.map((r) => toTeacherUser({ user: r, klass, isCouncil: false }))));
  });

  // AUTH-04 담임 비밀번호 초기화 → 임시 비밀번호 1회 반환
  router.post('/students/:id/reset-password', async (req, res) => {
    const user = currentUser(req);
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) throw AppError.badRequest('학생 번호가 올바르지 않아요.');
    const student = await userRepo.findUserById(studentId);
    if (!student || student.role !== 'student' || !student.class_id)
      throw AppError.notFound('학생을 찾을 수 없어요.');
    if (!(await canAccessClass(user, student.class_id)))
      throw AppError.forbidden('이 학생을 관리할 권한이 없어요.');
    const tempPassword = await getAuthService().resetPassword(studentId);
    await writeAudit({
      actorId: user.row.id,
      action: 'student.reset_password',
      targetType: 'user',
      targetId: studentId,
      ip: clientIp(req),
    });
    const data: ResetPasswordResult = { tempPassword };
    res.json(ok(data));
  });

  // ---------- S2: 승인 대기함·반 글 (TCH-02 기본형, APR-06 교사 직접 승인) ----------

  const postTypes = (raw: unknown): PostType[] =>
    raw === 'article'
      ? ['article']
      : raw === 'all'
        ? ['report', 'diary', 'article']
        : ['report', 'diary'];

  /** APR-07: pending 상태로 기준 시간을 넘겼는가 (배치가 escalated_at 을 찍기 전에도 시간으로 판정) */
  const isEscalated = (
    p: { status: string; submitted_at: Date | null; escalated_at: Date | null },
    hours: number,
  ): boolean =>
    p.status === 'pending' &&
    (p.escalated_at !== null ||
      (p.submitted_at !== null && Date.now() - p.submitted_at.getTime() >= hours * 3_600_000));

  const countPending = (
    posts: Array<{ status: string; submitted_at: Date | null; escalated_at: Date | null }>,
    hours: number,
  ): PendingCounts => ({
    reviewed: posts.filter((p) => p.status === 'reviewed').length,
    flagged: posts.filter((p) => p.status === 'flagged').length,
    pending: posts.filter((p) => p.status === 'pending').length,
    escalated: posts.filter((p) => isEscalated(p, hours)).length,
  });

  /** 승인 대기함 (TCH-02, APR-05, 07): 1차 통과 / 보류 요청 / 미검토(+48시간 초과) */
  router.get('/classes/:id/pending', requireClassAccess('id'), async (req, res) => {
    const classId = Number(req.params.id);
    const klass = await classRepo.findClassById(classId);
    if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
    const setting = await resolveApproval(classId, klass.grade);
    const bundles = await postRepo.listByClass(
      classId,
      ['pending', 'reviewed', 'flagged'],
      postTypes(req.query.type),
    );
    const posts = bundles.map((b) => b.post);
    const data: PendingQueueView = {
      classId,
      approvalMode: setting.mode,
      autoEscalateHours: setting.autoEscalateHours,
      escalatedIds: posts.filter((p) => isEscalated(p, setting.autoEscalateHours)).map((p) => p.id),
      counts: countPending(posts, setting.autoEscalateHours),
      items: bundles.map(toTeacherPostView),
    };
    res.json(ok(data));
  });

  /** 메뉴 배지·대시보드용: 내가 볼 수 있는 반의 대기 건수 (TCH-02) */
  router.get('/pending-counts', async (req, res) => {
    const user = currentUser(req);
    const year = await currentSchoolYear();
    if (!year) return res.json(ok({ total: 0, byClass: [] }));
    const all = await classRepo.listClassesByYear(year.id);
    const grades = advisorGrades(user);
    const visible = all.filter(
      (c) =>
        hasRole(user, 'admin') ||
        hasRole(user, 'approver') ||
        user.classIds.includes(c.id) ||
        grades.includes(c.grade),
    );
    if (visible.length === 0) return res.json(ok({ total: 0, byClass: [] }));
    const settings = await resolveAllClasses(visible.map((c) => ({ id: c.id, grade: c.grade })));
    const rows = await query<{
      class_id: number;
      status: string;
      submitted_at: Date | null;
      escalated_at: Date | null;
    }>(
      `SELECT class_id, status, submitted_at, escalated_at FROM posts
       WHERE deleted_at IS NULL AND status IN ('pending','reviewed','flagged')
         AND class_id IN (${visible.map(() => '?').join(',')})`,
      visible.map((c) => c.id),
    );
    const byClass = visible.map((c) => ({
      classId: c.id,
      className: c.name,
      ...countPending(
        rows.filter((r) => r.class_id === c.id),
        settings.get(c.id)?.autoEscalateHours ?? 48,
      ),
    }));
    const total = byClass.reduce((s, c) => s + c.reviewed + c.flagged + c.pending, 0);
    res.json(ok({ total, byClass }));
  });

  /** APR-08 검토 이력: 임원 검토·교사 처리·자동 승격 로그 (교사 화면이므로 실명 표시) */
  router.get('/posts/:id/history', async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    const post = await postRepo.findPostById(id);
    if (!post) throw AppError.notFound('글을 찾을 수 없어요.');
    if (!(await canAccessClass(user, post.class_id)))
      throw AppError.forbidden('이 반의 글을 볼 권한이 없어요.');
    const logs = await listReviewLogs(id);
    const data: ReviewLogView[] = logs.map((l) => ({
      id: l.id,
      action: l.action,
      actorRole: l.actor_role,
      actorName: l.actor_role === 'system' ? null : l.actor_name,
      checklist: l.checklist,
      note: l.note,
      createdAt: l.created_at.toISOString(),
    }));
    res.json(ok(data));
  });

  /** NWS-09 마감 토론 베스트 의견: 목록 + 선정(학년별 상한, 담당 반) */
  router.get('/news/closed', async (req, res) => {
    res.json(ok(await closedTopicsForTeacher(currentUser(req))));
  });
  router.post('/news/topics/:id/best', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('주제 번호가 올바르지 않아요.');
    const body = z
      .object({ commentIds: z.array(z.number().int().positive()).max(50) })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('선정할 댓글을 골라 주세요.');
    res.json(ok(await selectBest(currentUser(req), id, body.data.commentIds, clientIp(req))));
  });

  /** PT-04 교사 칭찬 포인트 */
  router.post('/students/:id/bonus', async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) throw AppError.badRequest('학생 번호가 올바르지 않아요.');
    const body = z
      .object({ amount: z.number().int(), reason: z.string().max(100) })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('포인트와 칭찬 이유를 적어 주세요.');
    res.json(
      ok(
        await teacherBonus(
          currentUser(req),
          studentId,
          body.data.amount,
          body.data.reason,
          clientIp(req),
        ),
      ),
    );
  });

  router.get('/classes/:id/posts', requireClassAccess('id'), async (req, res) => {
    const classId = Number(req.params.id);
    const status = String(req.query.status ?? 'approved');
    const statuses: PostStatus[] =
      status === 'all'
        ? ['draft', 'pending', 'reviewed', 'flagged', 'approved', 'rejected', 'hidden']
        : (status
            .split(',')
            .filter((s) =>
              [
                'draft',
                'pending',
                'reviewed',
                'flagged',
                'approved',
                'rejected',
                'hidden',
              ].includes(s),
            ) as PostStatus[]);
    const bundles = await postRepo.listByClass(classId, statuses, postTypes(req.query.type));
    res.json(ok(bundles.map(toTeacherPostView)));
  });

  const postIdParam = (raw: unknown): number => {
    const id = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    return id;
  };

  router.post('/posts/:id/approve', async (req, res) => {
    const bundle = await transition(postIdParam(req.params.id), 'approve', currentUser(req), {
      ip: clientIp(req),
    });
    res.json(ok(toTeacherPostView(bundle)));
  });

  router.post('/posts/:id/reject', async (req, res) => {
    const body = z
      .object({
        reasonCode: z.enum(['capture_mismatch', 'too_short', 'inappropriate', 'other']),
        reasonText: z.string().max(200).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('반려 사유를 골라 주세요.');
    const bundle = await transition(postIdParam(req.params.id), 'reject', currentUser(req), {
      ...body.data,
      ip: clientIp(req),
    });
    res.json(ok(toTeacherPostView(bundle)));
  });

  router.post('/posts/:id/hide', async (req, res) => {
    const body = z.object({ reason: z.string().max(200).optional() }).safeParse(req.body);
    const bundle = await transition(postIdParam(req.params.id), 'hide', currentUser(req), {
      hiddenReason: body.success ? body.data.reason : undefined,
      ip: clientIp(req),
    });
    res.json(ok(toTeacherPostView(bundle)));
  });

  router.post('/posts/:id/unhide', async (req, res) => {
    const bundle = await transition(postIdParam(req.params.id), 'unhide', currentUser(req), {
      ip: clientIp(req),
    });
    res.json(ok(toTeacherPostView(bundle)));
  });

  // ---------- S3: 댓글 모아보기 (TCH-06, 07) ----------
  const scopeSchema = z.object({
    scope: z.enum(['class', 'grade', 'group']),
    id: z.string().min(1).max(10),
  });

  router.get('/comments', async (req, res) => {
    const user = currentUser(req);
    let scope: tc.CommentScope;
    let scopeId: string;
    const parsed = scopeSchema.safeParse({ scope: req.query.scope, id: req.query.id });
    if (parsed.success) {
      scope = parsed.data.scope;
      scopeId = parsed.data.id;
    } else {
      const d = tc.defaultScope(user);
      if (!d) throw AppError.badRequest('볼 수 있는 반이 없어요.');
      scope = d.scope;
      scopeId = d.scopeId;
    }
    const flag =
      req.query.flag === 'reported' || req.query.flag === 'banned' ? req.query.flag : 'all';
    const since =
      typeof req.query.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since)
        ? `${req.query.since} 00:00:00`
        : undefined;
    const beforeId = req.query.cursor ? Number(req.query.cursor) : undefined;
    res.json(
      ok(
        await tc.listComments(user, scope, scopeId, {
          since,
          flag,
          beforeId: Number.isInteger(beforeId) ? beforeId : undefined,
        }),
      ),
    );
  });

  router.post('/comments/:id/hide', async (req, res) => {
    const body = z.object({ reason: z.string().max(200).optional() }).safeParse(req.body);
    await tc.hideComment(
      currentUser(req),
      postIdParam(req.params.id),
      body.success ? body.data.reason : undefined,
      clientIp(req),
    );
    res.json(ok({ hidden: true }));
  });

  router.post('/comments/:id/unhide', async (req, res) => {
    await tc.unhideComment(currentUser(req), postIdParam(req.params.id), clientIp(req));
    res.json(ok({ hidden: false }));
  });

  router.post('/comments/:id/notify', async (req, res) => {
    const body = z
      .object({ code: z.enum(['kind', 'privacy', 'spam', 'hidden']) })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('안내 문구를 골라 주세요.');
    await tc.notifyCommentAuthor(
      currentUser(req),
      postIdParam(req.params.id),
      body.data.code,
      clientIp(req),
    );
    res.json(ok({ notified: true }));
  });

  router.post('/comments/checked', async (req, res) => {
    const body = scopeSchema.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('범위를 확인해 주세요.');
    await tc.markChecked(currentUser(req), body.data.scope, body.data.id);
    res.json(ok({ checked: true }));
  });

  // ---------- S3: 신고함 (TCH-04, RCT-05) ----------
  router.get('/reports', async (req, res) => {
    const status = req.query.status === 'all' ? 'all' : 'open';
    res.json(ok(await tc.listReports(currentUser(req), status)));
  });

  router.post('/reports/:id/handle', async (req, res) => {
    const body = z.object({ action: z.enum(['keep', 'hide', 'delete']) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('처리 방법을 골라 주세요.');
    await tc.handleReport(
      currentUser(req),
      postIdParam(req.params.id),
      body.data.action,
      clientIp(req),
    );
    res.json(ok({ handled: true }));
  });

  /**
   * 일괄 승인 (TCH-02, APR-05). {ids} 선택 승인 또는 {stage:'reviewed', classId} 1차 통과 전체 승인.
   * 실패한 글은 이유와 함께 돌려주고 나머지는 계속
   */
  router.post('/posts/bulk-approve', async (req, res) => {
    const body = z
      .union([
        z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }),
        z.object({ stage: z.literal('reviewed'), classId: z.number().int().positive() }),
      ])
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('승인할 글을 골라 주세요.');
    const user = currentUser(req);
    let ids: number[];
    if ('ids' in body.data) {
      ids = body.data.ids;
    } else {
      if (!(await canAccessClass(user, body.data.classId)))
        throw AppError.forbidden('이 반을 관리할 권한이 없어요.');
      const bundles = await postRepo.listByClass(
        body.data.classId,
        ['reviewed'],
        ['report', 'diary', 'article'],
      );
      ids = bundles.map((b) => b.post.id);
    }
    const data: BulkApproveResult = { approved: [], failed: [] };
    for (const id of ids) {
      try {
        await transition(id, 'approve', user, { ip: clientIp(req) });
        data.approved.push(id);
      } catch (err) {
        data.failed.push({ id, message: err instanceof Error ? err.message : '실패' });
      }
    }
    res.json(ok(data));
  });

  return router;
}
