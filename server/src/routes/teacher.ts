/**
 * 교사 API (AUTH-04, AUTH-07, TCH-03 일부). 반 단위 접근은 requireClassAccess 로 검사.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/query.js';
import { AppError, ok } from '../lib/apiResponse.js';
import { toTeacherPostView } from '../lib/serializers/post.js';
import { toTeacherUser } from '../lib/serializers/user.js';
import * as postRepo from '../repos/postRepo.js';
import { transition } from '../services/PostService.js';
import type { BulkApproveResult, PendingQueueView } from '../types/api.js';
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

  /** 반의 승인 모드 (APR-01): class → grade → school 순으로 덮어쓰기 */
  async function approvalModeFor(
    classId: number,
    grade: number,
  ): Promise<'two_step' | 'teacher_only'> {
    const rows = await query<{
      scope: string;
      scope_id: number | null;
      mode: 'two_step' | 'teacher_only';
    }>(
      `SELECT scope, scope_id, mode FROM approval_settings
       WHERE (scope = 'class' AND scope_id = ?) OR (scope = 'grade' AND scope_id = ?) OR scope = 'school'
       ORDER BY FIELD(scope, 'class', 'grade', 'school') LIMIT 1`,
      [classId, grade],
    );
    return rows[0]?.mode ?? 'two_step';
  }

  router.get('/classes/:id/pending', requireClassAccess('id'), async (req, res) => {
    const classId = Number(req.params.id);
    const klass = await classRepo.findClassById(classId);
    if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
    const bundles = await postRepo.listByClass(
      classId,
      ['pending', 'reviewed', 'flagged'],
      postTypes(req.query.type),
    );
    const data: PendingQueueView = {
      classId,
      approvalMode: await approvalModeFor(classId, klass.grade),
      items: bundles.map(toTeacherPostView),
    };
    res.json(ok(data));
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

  /** 선택 일괄 승인 (TCH-02). 실패한 글은 이유와 함께 돌려주고 나머지는 계속 */
  router.post('/posts/bulk-approve', async (req, res) => {
    const body = z
      .object({ ids: z.array(z.number().int().positive()).min(1).max(100) })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('승인할 글을 골라 주세요.');
    const user = currentUser(req);
    const data: BulkApproveResult = { approved: [], failed: [] };
    for (const id of body.data.ids) {
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
