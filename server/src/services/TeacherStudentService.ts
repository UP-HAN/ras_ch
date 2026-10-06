/**
 * 담임·배정 교사의 학생 관리 (AUTH-07, 절대 규칙 2) — 2026-10-06 사용자 요청
 *  - 자기 반 학생만 추가·삭제·수정하고, 자치회 임원·기자단도 정할 수 있다
 *  - 다른 반 학생을 건드리면 403. 권한 판정은 기존 `canAccessClass` 를 그대로 쓴다
 *  - 실제 동작은 관리자와 같은 서비스(importStudents·deleteUser·CouncilAdminService)를 재사용한다
 */
import { AppError } from '../lib/apiResponse.js';
import { findClassById } from '../repos/classRepo.js';
import { findActiveMembership } from '../repos/councilRepo.js';
import { findUserById } from '../repos/userRepo.js';
import { canAccessClass } from '../middleware/auth.js';
import type { AuthUser } from '../types/auth.js';
import type { UserRow, YesNo } from '../types/db.js';
import type { CouncilMemberView, ImportResult } from '../types/api.js';
import { updateStudent } from './AdminService.js';
import { addMember, removeMember } from './CouncilAdminService.js';
import { importStudents } from './StudentImportService.js';
import { deleteUser } from './UserAdminService.js';

const actorOf = (user: AuthUser, ip?: string) => ({ id: user.row.id, ip });

/** 이 학생이 내가 관리하는 반에 있는가 (AUTH-07). 아니면 403 */
export async function assertMyStudent(user: AuthUser, studentId: number): Promise<UserRow> {
  const s = await findUserById(studentId);
  if (!s || s.role !== 'student') throw AppError.notFound('학생을 찾을 수 없어요.');
  if (s.class_id === null || !(await canAccessClass(user, s.class_id)))
    throw AppError.forbidden('이 학생을 관리할 권한이 없어요.');
  return s;
}

export interface AddStudentInput {
  studentNo: number;
  name: string;
  parentConsent: YesNo;
  isReporter: boolean;
  /** 비우면 자동 생성(4자리 숫자 + 이름 첫 글자) */
  initialPassword: string | null;
}

/**
 * 자기 반에 학생 한 명 추가. CSV 등록과 같은 경로(importStudents)를 써서
 * 아이디 생성·display_name 재계산·같은 번호 갱신 규칙이 똑같이 적용된다.
 */
export async function addStudent(
  user: AuthUser,
  classId: number,
  input: AddStudentInput,
  ip?: string,
): Promise<ImportResult> {
  const klass = await findClassById(classId);
  if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');

  const name = input.name.trim();
  if (name.length < 2 || name.length > 20)
    throw AppError.badRequest('이름을 2~20자로 적어 주세요.');
  if (!Number.isInteger(input.studentNo) || input.studentNo < 1 || input.studentNo > 99)
    throw AppError.badRequest('번호를 1~99 사이로 적어 주세요.');

  const result = await importStudents(
    [
      {
        line: 1,
        grade: klass.grade,
        classNo: klass.class_no,
        studentNo: input.studentNo,
        name,
        initialPassword: input.initialPassword?.trim() ? input.initialPassword.trim() : null,
        parentConsent: input.parentConsent,
        isReporter: input.isReporter,
      },
    ],
    { dryRun: false, actorId: user.row.id, ip },
  );
  if (result.errors.length > 0)
    throw AppError.badRequest(result.errors[0]?.message ?? '학생을 추가하지 못했어요.');
  return result;
}

/** 자기 반 학생 정보 수정 — 기자단·학부모동의 (ADM-01 과 같은 서비스) */
export async function editStudent(
  user: AuthUser,
  studentId: number,
  patch: { isReporter?: boolean; parentConsent?: YesNo },
  ip?: string,
): Promise<void> {
  await assertMyStudent(user, studentId);
  if (patch.isReporter === undefined && patch.parentConsent === undefined)
    throw AppError.badRequest('바꿀 내용이 없어요.');
  await updateStudent(actorOf(user, ip), studentId, patch);
}

/** 자기 반 학생 삭제 — 활동 기록이 있으면 409 (관리자와 같은 규칙) */
export async function removeStudent(user: AuthUser, studentId: number, ip?: string): Promise<void> {
  await assertMyStudent(user, studentId);
  await deleteUser(actorOf(user, ip), studentId);
}

export interface CouncilInput {
  title: string;
  termStart: string;
  termEnd: string | null;
}

/** 자기 반 학생을 자치회 임원으로 지정 (CNC-03) */
export async function setCouncilMember(
  user: AuthUser,
  studentId: number,
  input: CouncilInput,
  ip?: string,
): Promise<CouncilMemberView> {
  await assertMyStudent(user, studentId);
  return addMember(
    user,
    {
      userId: studentId,
      title: input.title,
      termStart: input.termStart,
      termEnd: input.termEnd,
    },
    ip,
  );
}

/** 자기 반 학생의 임원 해제 (CNC-03) */
export async function clearCouncilMember(
  user: AuthUser,
  studentId: number,
  ip?: string,
): Promise<void> {
  await assertMyStudent(user, studentId);
  const m = await findActiveMembership(studentId);
  if (!m) throw AppError.notFound('지금 임원이 아니에요.');
  await removeMember(user, m.id, ip);
}
