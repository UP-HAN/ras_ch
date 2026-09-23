/**
 * 학생 로그인 ID (PRD 3.1, 2026-09-23 확정): 학년도 2자리 + 학년 1자리 + 반(1~2자리, 0 없이) + 번호 2자리
 *   26학년도 5학년 1반 1번  → "265101"
 *   26학년도 5학년 10반 1번 → "2651001"
 * 번호가 항상 2자리라 뒤에서부터 읽으면 반 자릿수가 달라도 헷갈리지 않는다.
 */
const RE = /^(\d{2})(\d)(\d{1,2})(\d{2})$/;

export function buildStudentLoginId(
  year: number,
  grade: number,
  classNo: number,
  studentNo: number,
): string {
  const yy = String(year).slice(-2);
  return `${yy}${grade}${classNo}${String(studentNo).padStart(2, '0')}`;
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
