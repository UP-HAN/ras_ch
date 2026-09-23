import { describe, expect, it } from 'vitest';
import { buildStudentLoginId, parseStudentLoginId } from './studentId.js';

// PRD 3.1 (2026-09-23 확정): 학년도2 + 학년1 + 반(0 없이) + 번호2
describe('studentId', () => {
  it('2026학년도 5학년 1반 1번 → 265101', () => {
    expect(buildStudentLoginId(2026, 5, 1, 1)).toBe('265101');
    expect(buildStudentLoginId(2026, 3, 2, 15)).toBe('263215');
  });

  it('10반 이상은 반이 2자리: 5학년 10반 1번 → 2651001', () => {
    expect(buildStudentLoginId(2026, 5, 10, 1)).toBe('2651001');
    expect(buildStudentLoginId(2026, 6, 12, 3)).toBe('2661203');
  });

  it('파싱은 뒤에서부터(번호 2자리 고정)', () => {
    expect(parseStudentLoginId('265101')).toEqual({ yy: '26', grade: 5, classNo: 1, studentNo: 1 });
    expect(parseStudentLoginId('2651001')).toEqual({
      yy: '26',
      grade: 5,
      classNo: 10,
      studentNo: 1,
    });
    expect(parseStudentLoginId('263215')).toEqual({
      yy: '26',
      grade: 3,
      classNo: 2,
      studentNo: 15,
    });
    expect(parseStudentLoginId('admin@ches.es.kr')).toBeNull();
    expect(parseStudentLoginId('26-3-02-15')).toBeNull();
  });
});
