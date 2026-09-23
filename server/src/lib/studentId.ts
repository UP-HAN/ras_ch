/**
 * 학생 로그인 ID (PRD 3.1): 학년도 2자리-학년-반 2자리-번호 2자리, 예 "26-3-02-15"
 */
const RE = /^(\d{2})-(\d)-(\d{2})-(\d{2})$/;

export function buildStudentLoginId(
  year: number,
  grade: number,
  classNo: number,
  studentNo: number,
): string {
  const yy = String(year).slice(-2);
  return `${yy}-${grade}-${String(classNo).padStart(2, '0')}-${String(studentNo).padStart(2, '0')}`;
}

export interface ParsedStudentId {
  yy: string;
  grade: number;
  classNo: number;
  studentNo: number;
}

export function parseStudentLoginId(loginId: string): ParsedStudentId | null {
  const m = RE.exec(loginId.trim());
  if (!m) return null;
  return {
    yy: m[1] as string,
    grade: Number(m[2]),
    classNo: Number(m[3]),
    studentNo: Number(m[4]),
  };
}
