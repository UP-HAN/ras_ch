/**
 * 인증된 요청 사용자 (AUTH-07, 절대 규칙 2)
 *  - 세션의 userId 로 요청마다 users 를 1회 조회하고, 역할 판정에 필요한 부가 정보를 붙인다
 *  - 권한 검사는 전부 서버(middleware/auth.ts)에서 한다
 */
import type { ClassRow, UserRow } from './db.js';

/** requireRole() 에 쓰는 앱 역할. admin 은 교사 계열 역할을 모두 포함한다 */
export type AppRole =
  'student' | 'council' | 'teacher' | 'approver' | 'grade_advisor' | 'admin' | 'council_teacher';

export interface AuthUser {
  row: UserRow;
  /** 학생: 활성 council_members 행이 있으면 true */
  isCouncil: boolean;
  /** 교사: 담임 반 + teacher_classes 로 배정된 반 id (중복 제거) */
  classIds: number[];
  /** 교사: 담임(homeroom_teacher_id)인 반 id */
  homeroomClassIds: number[];
  /** 학생: 소속 반 */
  klass: Pick<ClassRow, 'id' | 'name' | 'grade'> | null;
}

export function hasRole(user: AuthUser, role: AppRole): boolean {
  const { row } = user;
  switch (role) {
    case 'student':
      return row.role === 'student';
    case 'council':
      return row.role === 'student' && user.isCouncil;
    case 'council_teacher':
      return row.role === 'council_teacher';
    case 'teacher':
      return row.role === 'teacher' || row.role === 'admin';
    case 'approver':
      return row.role === 'admin' || (row.role === 'teacher' && row.is_approver === 1);
    case 'grade_advisor':
      return row.role === 'admin' || (row.role === 'teacher' && row.advisor_grade_group !== null);
    case 'admin':
      return row.role === 'admin';
  }
}

/** 학년군 지도교사가 담당하는 학년 목록 */
export function advisorGrades(user: AuthUser): number[] {
  if (user.row.role === 'admin') return [3, 4, 5, 6];
  if (user.row.advisor_grade_group === '3-4') return [3, 4];
  if (user.row.advisor_grade_group === '5-6') return [5, 6];
  return [];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- express 타입 확장 관례
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
