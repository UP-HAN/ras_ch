import { describe, expect, it } from 'vitest';
import { buildStudentLoginId, parseStudentLoginId } from './studentId.js';

// PRD 3.1: 학년도 + 학년 + 반 + 번호 (예: 26-3-02-15)
describe('studentId', () => {
  it('2026학년도 3학년 2반 15번 → 26-3-02-15', () => {
    expect(buildStudentLoginId(2026, 3, 2, 15)).toBe('26-3-02-15');
    expect(buildStudentLoginId(2026, 6, 12, 3)).toBe('26-6-12-03');
  });

  it('파싱', () => {
    expect(parseStudentLoginId('26-3-02-15')).toEqual({
      yy: '26',
      grade: 3,
      classNo: 2,
      studentNo: 15,
    });
    expect(parseStudentLoginId('admin@ches.es.kr')).toBeNull();
  });
});
