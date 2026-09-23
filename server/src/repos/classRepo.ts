import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { ClassRow } from '../types/db.js';

export interface ClassWithMeta extends ClassRow {
  homeroom_teacher_name: string | null;
  student_count: number;
  teacher_ids: number[];
}

export async function listClassesByYear(schoolYearId: number): Promise<ClassWithMeta[]> {
  const rows = await query<
    ClassRow & { homeroom_teacher_name: string | null; student_count: number }
  >(
    `SELECT c.*, t.name AS homeroom_teacher_name,
            (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id AND u.role = 'student' AND u.status = 'active') AS student_count
     FROM classes c LEFT JOIN users t ON t.id = c.homeroom_teacher_id
     WHERE c.school_year_id = ? ORDER BY c.grade, c.class_no`,
    [schoolYearId],
  );
  const tc = await query<{ class_id: number; teacher_id: number }>(
    'SELECT class_id, teacher_id FROM teacher_classes WHERE class_id IN (SELECT id FROM classes WHERE school_year_id = ?)',
    [schoolYearId],
  );
  const byClass = new Map<number, number[]>();
  for (const r of tc) byClass.set(r.class_id, [...(byClass.get(r.class_id) ?? []), r.teacher_id]);
  return rows.map((r) => ({ ...r, teacher_ids: byClass.get(r.id) ?? [] }));
}

export async function findClassById(
  id: number,
  conn: Executor = getPool(),
): Promise<ClassRow | null> {
  return queryOne<ClassRow>('SELECT * FROM classes WHERE id = ?', [id], conn);
}

export async function findClassByGradeNo(
  schoolYearId: number,
  grade: number,
  classNo: number,
  conn: Executor = getPool(),
): Promise<ClassRow | null> {
  return queryOne<ClassRow>(
    'SELECT * FROM classes WHERE school_year_id = ? AND grade = ? AND class_no = ?',
    [schoolYearId, grade, classNo],
    conn,
  );
}

export async function insertClass(
  schoolYearId: number,
  grade: number,
  classNo: number,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO classes (school_year_id, grade, class_no, name) VALUES (?, ?, ?, ?)',
    [schoolYearId, grade, classNo, `${grade}-${classNo}`],
    conn,
  );
}

export async function setHomeroom(classId: number, teacherId: number | null): Promise<void> {
  await execute('UPDATE classes SET homeroom_teacher_id = ? WHERE id = ?', [teacherId, classId]);
}

/** 반에 배정된 교사 목록을 통째로 교체 (한 교사가 여러 반 가능, AUTH-05) */
export async function setClassTeachers(classId: number, teacherIds: number[]): Promise<void> {
  await execute('DELETE FROM teacher_classes WHERE class_id = ?', [classId]);
  for (const t of [...new Set(teacherIds)]) {
    await execute('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [t, classId]);
  }
}

export async function listClassesForTeacher(teacherId: number): Promise<ClassRow[]> {
  return query<ClassRow>(
    `SELECT DISTINCT c.* FROM classes c
     LEFT JOIN teacher_classes tc ON tc.class_id = c.id
     WHERE c.homeroom_teacher_id = ? OR tc.teacher_id = ?
     ORDER BY c.grade, c.class_no`,
    [teacherId, teacherId],
  );
}

export async function listClassesByGrades(
  schoolYearId: number,
  grades: number[],
): Promise<ClassRow[]> {
  if (grades.length === 0) return [];
  return query<ClassRow>(
    `SELECT * FROM classes WHERE school_year_id = ? AND grade IN (${grades.map(() => '?').join(',')}) ORDER BY grade, class_no`,
    [schoolYearId, ...grades],
  );
}
