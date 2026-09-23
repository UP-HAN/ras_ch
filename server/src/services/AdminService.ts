/**
 * 관리자 기능 (ADM-01, AUTH-05, AUTH-08/09, PUT /admin/teachers/:id/roles, PATCH /admin/students/:id)
 * 모든 변경은 audit_logs 에 남긴다.
 */
import { AppError } from '../lib/apiResponse.js';
import { generateInitialPassword, hashPassword, validatePasswordPolicy } from '../lib/password.js';
import { toTeacherUser } from '../lib/serializers/user.js';
import { kst } from '../lib/time.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as classRepo from '../repos/classRepo.js';
import * as yearRepo from '../repos/schoolYearRepo.js';
import * as userRepo from '../repos/userRepo.js';
import type { ClassView, SchoolYearView, TeacherUser, TeacherView } from '../types/api.js';
import type { GradeGroup, UserRow, UserStatus, YesNo } from '../types/db.js';

interface Actor {
  id: number;
  ip?: string;
}

function toSchoolYearView(
  r: Awaited<ReturnType<typeof yearRepo.listSchoolYears>>[number],
): SchoolYearView {
  return {
    id: r.id,
    year: r.year,
    startDate: kst(r.start_date).format('YYYY-MM-DD'),
    endDate: kst(r.end_date).format('YYYY-MM-DD'),
    isCurrent: r.is_current === 1,
  };
}

function toClassView(c: classRepo.ClassWithMeta): ClassView {
  return {
    id: c.id,
    grade: c.grade,
    classNo: c.class_no,
    name: c.name,
    homeroomTeacherId: c.homeroom_teacher_id,
    homeroomTeacherName: c.homeroom_teacher_name,
    teacherIds: c.teacher_ids,
    studentCount: Number(c.student_count),
  };
}

export async function listSchoolYears(): Promise<SchoolYearView[]> {
  return (await yearRepo.listSchoolYears()).map(toSchoolYearView);
}

export async function createSchoolYear(
  actor: Actor,
  input: { year: number; startDate: string; endDate: string; makeCurrent: boolean },
): Promise<number> {
  const id = await yearRepo.insertSchoolYear(input.year, input.startDate, input.endDate);
  if (input.makeCurrent) await yearRepo.setCurrentSchoolYear(id);
  await writeAudit({
    actorId: actor.id,
    action: 'school_year.create',
    targetType: 'school_year',
    targetId: id,
    payload: input,
    ip: actor.ip,
  });
  return id;
}

export async function setCurrentSchoolYear(actor: Actor, id: number): Promise<void> {
  await yearRepo.setCurrentSchoolYear(id);
  await writeAudit({
    actorId: actor.id,
    action: 'school_year.set_current',
    targetType: 'school_year',
    targetId: id,
    ip: actor.ip,
  });
}

export async function listClasses(schoolYearId?: number): Promise<ClassView[]> {
  const yearId = schoolYearId ?? (await yearRepo.currentSchoolYear())?.id;
  if (!yearId) return [];
  return (await classRepo.listClassesByYear(yearId)).map(toClassView);
}

export async function createClass(
  actor: Actor,
  input: { grade: number; classNo: number },
): Promise<number> {
  const year = await yearRepo.currentSchoolYear();
  if (!year) throw AppError.conflict('현재 학년도가 없어요. 학년도를 먼저 만들어 주세요.');
  const dup = await classRepo.findClassByGradeNo(year.id, input.grade, input.classNo);
  if (dup) throw AppError.conflict(`${input.grade}-${input.classNo} 반은 이미 있어요.`);
  const id = await classRepo.insertClass(year.id, input.grade, input.classNo);
  await writeAudit({
    actorId: actor.id,
    action: 'class.create',
    targetType: 'class',
    targetId: id,
    payload: input,
    ip: actor.ip,
  });
  return id;
}

async function assertTeacher(id: number): Promise<UserRow> {
  const t = await userRepo.findUserById(id);
  if (!t || (t.role !== 'teacher' && t.role !== 'admin'))
    throw AppError.notFound('교사를 찾을 수 없어요.');
  return t;
}

export async function setHomeroom(
  actor: Actor,
  classId: number,
  teacherId: number | null,
): Promise<void> {
  if (!(await classRepo.findClassById(classId))) throw AppError.notFound('반을 찾을 수 없어요.');
  if (teacherId !== null) await assertTeacher(teacherId);
  await classRepo.setHomeroom(classId, teacherId);
  await writeAudit({
    actorId: actor.id,
    action: 'class.set_homeroom',
    targetType: 'class',
    targetId: classId,
    payload: { teacherId },
    ip: actor.ip,
  });
}

export async function setClassTeachers(
  actor: Actor,
  classId: number,
  teacherIds: number[],
): Promise<void> {
  if (!(await classRepo.findClassById(classId))) throw AppError.notFound('반을 찾을 수 없어요.');
  for (const t of teacherIds) await assertTeacher(t);
  await classRepo.setClassTeachers(classId, teacherIds);
  await writeAudit({
    actorId: actor.id,
    action: 'class.set_teachers',
    targetType: 'class',
    targetId: classId,
    payload: { teacherIds },
    ip: actor.ip,
  });
}

export async function listTeachers(): Promise<TeacherView[]> {
  const rows = await userRepo.listTeachers();
  const out: TeacherView[] = [];
  for (const r of rows) {
    const classes = await classRepo.listClassesForTeacher(r.id);
    out.push({
      ...toTeacherUser({ user: r, klass: null, isCouncil: false }),
      classIds: classes.map((c) => c.id),
    });
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createTeacher(
  actor: Actor,
  input: {
    loginId: string;
    name: string;
    password?: string;
    isApprover: boolean;
    advisorGradeGroup: GradeGroup | null;
    role: 'teacher' | 'admin';
  },
): Promise<{ id: number; initialPassword: string }> {
  const loginId = input.loginId.trim().toLowerCase();
  if (!EMAIL_RE.test(loginId)) throw AppError.badRequest('교사 ID는 이메일 형식이어야 해요.');
  if (await userRepo.findUserByLoginId(loginId)) throw AppError.conflict('이미 있는 교사 ID예요.');
  const initialPassword =
    input.password ??
    `${generateInitialPassword(input.name)}${Math.random().toString(36).slice(2, 6)}`;
  const policy = validatePasswordPolicy('teacher', initialPassword);
  if (!policy.ok) throw AppError.badRequest(policy.message as string);
  const id = await userRepo.insertTeacher({
    loginId,
    passwordHash: await hashPassword(initialPassword),
    name: input.name.trim(),
    role: input.role,
    isApprover: input.isApprover,
    advisorGradeGroup: input.advisorGradeGroup,
  });
  await writeAudit({
    actorId: actor.id,
    action: 'teacher.create',
    targetType: 'user',
    targetId: id,
    payload: {
      loginId,
      role: input.role,
      isApprover: input.isApprover,
      advisorGradeGroup: input.advisorGradeGroup,
    },
    ip: actor.ip,
  });
  return { id, initialPassword };
}

export async function setTeacherRoles(
  actor: Actor,
  teacherId: number,
  roles: { isApprover: boolean; advisorGradeGroup: GradeGroup | null },
): Promise<void> {
  await assertTeacher(teacherId);
  await userRepo.setTeacherRoles(teacherId, roles.isApprover, roles.advisorGradeGroup);
  await writeAudit({
    actorId: actor.id,
    action: 'teacher.set_roles',
    targetType: 'user',
    targetId: teacherId,
    payload: roles,
    ip: actor.ip,
  });
}

export async function listStudents(classId: number): Promise<TeacherUser[]> {
  const klass = await classRepo.findClassById(classId);
  if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
  const rows = await userRepo.listStudentsByClass(classId);
  return rows.map((r) => toTeacherUser({ user: r, klass, isCouncil: false }));
}

export async function updateStudent(
  actor: Actor,
  studentId: number,
  patch: { parentConsent?: YesNo; isReporter?: boolean; status?: UserStatus },
): Promise<void> {
  const student = await userRepo.findUserById(studentId);
  if (!student || student.role !== 'student') throw AppError.notFound('학생을 찾을 수 없어요.');
  await userRepo.updateStudent(studentId, patch);
  // AUTH-09: 동의 철회 → 30일 뒤 삭제 대기, 재동의 → 해제
  let imagesMarked: number | undefined;
  if (patch.parentConsent !== undefined && patch.parentConsent !== student.parent_consent) {
    const deleteAfter =
      patch.parentConsent === 'N' ? kst().add(30, 'day').format('YYYY-MM-DD') : null;
    imagesMarked = await userRepo.markStudentImagesForDeletion(studentId, deleteAfter);
  }
  await writeAudit({
    actorId: actor.id,
    action: 'student.update',
    targetType: 'user',
    targetId: studentId,
    payload: {
      ...patch,
      before: {
        parentConsent: student.parent_consent,
        isReporter: student.is_reporter === 1,
        status: student.status,
      },
      imagesMarked,
    },
    ip: actor.ip,
  });
}
