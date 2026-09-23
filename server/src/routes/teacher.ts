/**
 * 교사 API (AUTH-04, AUTH-07, TCH-03 일부). 반 단위 접근은 requireClassAccess 로 검사.
 */
import { Router } from 'express';
import { AppError, ok } from '../lib/apiResponse.js';
import { toTeacherUser } from '../lib/serializers/user.js';
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

  return router;
}
