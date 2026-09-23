/**
 * users 저장소. SQL 직접 작성. 응답으로 나갈 때는 serializers 를 거친다.
 */
import type { PoolConnection } from 'mysql2/promise';
import { assignDisplayNames } from '../lib/displayName.js';
import { toDbDateTime } from '../lib/time.js';
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { AuthUser } from '../types/auth.js';
import type { ClassRow, GradeGroup, Role, UserRow, UserStatus, YesNo } from '../types/db.js';

export async function findUserByLoginId(loginId: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE login_id = ? LIMIT 1', [loginId]);
}

export async function findUserById(
  id: number,
  conn: Executor = getPool(),
): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id], conn);
}

/** 세션 사용자 로딩: users 1회 + 역할 판정용 부가 정보 */
export async function loadAuthUser(id: number): Promise<AuthUser | null> {
  const row = await findUserById(id);
  if (!row || row.status === 'disabled') return null;

  if (row.role === 'student') {
    const klass = row.class_id
      ? await queryOne<Pick<ClassRow, 'id' | 'name' | 'grade'>>(
          'SELECT id, name, grade FROM classes WHERE id = ?',
          [row.class_id],
        )
      : null;
    const council = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM council_members
       WHERE user_id = ? AND is_active = 1 AND term_start <= CURDATE() AND (term_end IS NULL OR term_end >= CURDATE())`,
      [id],
    );
    return { row, isCouncil: (council?.n ?? 0) > 0, classIds: [], homeroomClassIds: [], klass };
  }

  const homerooms = await query<{ id: number }>(
    'SELECT id FROM classes WHERE homeroom_teacher_id = ?',
    [id],
  );
  const assigned = await query<{ class_id: number }>(
    'SELECT class_id FROM teacher_classes WHERE teacher_id = ?',
    [id],
  );
  const homeroomClassIds = homerooms.map((r) => r.id);
  const classIds = [...new Set([...homeroomClassIds, ...assigned.map((r) => r.class_id)])];
  return { row, isCouncil: false, classIds, homeroomClassIds, klass: null };
}

export async function recordLoginFailure(id: number, lockedUntil: Date | null): Promise<void> {
  await execute(
    'UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = ? WHERE id = ?',
    [lockedUntil ? toDbDateTime(lockedUntil) : null, id],
  );
}

export async function recordLoginSuccess(id: number): Promise<void> {
  await execute(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(3) WHERE id = ?',
    [id],
  );
}

export async function updatePassword(
  id: number,
  passwordHash: string,
  mustChange: boolean,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE users SET password_hash = ?, must_change_pw = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?',
    [passwordHash, mustChange ? 1 : 0, id],
    conn,
  );
}

export async function listStudentsByClass(
  classId: number,
  conn: Executor = getPool(),
): Promise<UserRow[]> {
  return query<UserRow>(
    "SELECT * FROM users WHERE role = 'student' AND class_id = ? ORDER BY student_no",
    [classId],
    conn,
  );
}

export async function findStudentByClassNo(
  classId: number,
  studentNo: number,
  conn: Executor = getPool(),
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    "SELECT * FROM users WHERE role = 'student' AND class_id = ? AND student_no = ? LIMIT 1",
    [classId, studentNo],
    conn,
  );
}

export interface NewStudent {
  loginId: string;
  passwordHash: string;
  name: string;
  classId: number;
  studentNo: number;
  parentConsent: YesNo;
  isReporter: boolean;
}

export async function insertStudent(s: NewStudent, conn: PoolConnection): Promise<number> {
  return insert(
    `INSERT INTO users (login_id, password_hash, role, name, display_name, class_id, student_no,
                        parent_consent, consent_updated_at, is_reporter, must_change_pw)
     VALUES (?, ?, 'student', ?, '', ?, ?, ?, NOW(3), ?, 1)`,
    [
      s.loginId,
      s.passwordHash,
      s.name,
      s.classId,
      s.studentNo,
      s.parentConsent,
      s.isReporter ? 1 : 0,
    ],
    conn,
  );
}

/** CSV 갱신: 이름·동의·기자단. 비밀번호는 호출자가 조건에 따라 별도로 바꾼다 */
export async function updateStudentFromImport(
  id: number,
  s: Pick<NewStudent, 'name' | 'parentConsent' | 'isReporter'>,
  consentChanged: boolean,
  conn: PoolConnection,
): Promise<void> {
  await execute(
    `UPDATE users SET name = ?, parent_consent = ?, is_reporter = ?,
       consent_updated_at = IF(?, NOW(3), consent_updated_at), status = 'active'
     WHERE id = ?`,
    [s.name, s.parentConsent, s.isReporter ? 1 : 0, consentChanged ? 1 : 0, id],
    conn,
  );
}

export interface StudentPatch {
  parentConsent?: YesNo;
  isReporter?: boolean;
  status?: UserStatus;
}

export async function updateStudent(
  id: number,
  patch: StudentPatch,
  conn: Executor = getPool(),
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.parentConsent !== undefined) {
    sets.push('parent_consent = ?', 'consent_updated_at = NOW(3)');
    params.push(patch.parentConsent);
  }
  if (patch.isReporter !== undefined) {
    sets.push('is_reporter = ?');
    params.push(patch.isReporter ? 1 : 0);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(
    `UPDATE users SET ${sets.join(', ')} WHERE id = ? AND role = 'student'`,
    params,
    conn,
  );
}

/** AUTH-09: 동의 철회 시 해당 학생 이미지에 삭제 예정일 표시, 재동의 시 해제 */
export async function markStudentImagesForDeletion(
  userId: number,
  deleteAfter: string | null,
  conn: Executor = getPool(),
): Promise<number> {
  const r = await execute(
    `UPDATE post_images pi JOIN posts p ON p.id = pi.post_id
     SET pi.delete_after = ? WHERE p.author_id = ?`,
    [deleteAfter, userId],
    conn,
  );
  return r.affectedRows;
}

/** 반 전체의 display_name 을 다시 계산해 저장 (3.1 중복 병기) */
export async function recomputeDisplayNames(
  classId: number,
  conn: Executor = getPool(),
): Promise<void> {
  const students = await listStudentsByClass(classId, conn);
  const named = assignDisplayNames(
    students.map((s) => ({
      id: s.id,
      classId: s.class_id,
      studentNo: s.student_no,
      name: s.name,
      current: s.display_name,
    })),
  );
  for (const { item, displayName } of named) {
    if (item.current !== displayName) {
      await execute('UPDATE users SET display_name = ? WHERE id = ?', [displayName, item.id], conn);
    }
  }
}

export async function listTeachers(): Promise<UserRow[]> {
  return query<UserRow>(
    "SELECT * FROM users WHERE role IN ('teacher','admin') ORDER BY role = 'admin' DESC, name",
  );
}

export interface NewTeacher {
  loginId: string;
  passwordHash: string;
  name: string;
  role: Extract<Role, 'teacher' | 'admin'>;
  isApprover: boolean;
  advisorGradeGroup: GradeGroup | null;
}

export async function insertTeacher(t: NewTeacher): Promise<number> {
  return insert(
    `INSERT INTO users (login_id, password_hash, role, is_approver, advisor_grade_group, name, display_name, must_change_pw)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [t.loginId, t.passwordHash, t.role, t.isApprover ? 1 : 0, t.advisorGradeGroup, t.name, t.name],
  );
}

export async function setTeacherRoles(
  id: number,
  isApprover: boolean,
  advisorGradeGroup: GradeGroup | null,
): Promise<void> {
  await execute(
    "UPDATE users SET is_approver = ?, advisor_grade_group = ? WHERE id = ? AND role IN ('teacher','admin')",
    [isApprover ? 1 : 0, advisorGradeGroup, id],
  );
}
