import { describe, expect, it } from 'vitest';
import { parseStudentCsv } from './StudentImportService.js';

const HEADER = '학년,반,번호,이름,초기비밀번호,학부모동의,기자단';

// AUTH-03: CSV 검증(학년 3~6, 중복, Y/N)
describe('parseStudentCsv', () => {
  it('정상 행을 파싱하고 빈 비밀번호는 null', () => {
    const r = parseStudentCsv(
      `${HEADER}\n3,1,5,김초롱,,Y,N\n4,2,12,이서준,abcd,N,Y\n`,
      [3, 4, 5, 6],
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        line: 2,
        grade: 3,
        classNo: 1,
        studentNo: 5,
        name: '김초롱',
        initialPassword: null,
        parentConsent: 'Y',
        isReporter: false,
      },
      {
        line: 3,
        grade: 4,
        classNo: 2,
        studentNo: 12,
        name: '이서준',
        initialPassword: 'abcd',
        parentConsent: 'N',
        isReporter: true,
      },
    ]);
  });

  it('학년 범위 밖·잘못된 Y/N·짧은 비밀번호는 행 번호와 함께 오류', () => {
    const r = parseStudentCsv(
      `${HEADER}\n2,1,1,홍길동,,Y,N\n3,1,2,김철수,12,Y,N\n3,1,3,박영희,,maybe,N\n`,
      [3, 4, 5, 6],
    );
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[0]?.message).toContain('학년');
    expect(r.errors[1]?.message).toContain('4자');
    expect(r.errors[2]?.message).toContain('Y 또는 N');
  });

  // QA #12: 학부모동의 X/O/빈칸은 오류, 기자단 빈칸은 N
  it('학부모동의는 Y/N 만 허용하고 기자단 빈칸은 N', () => {
    const r = parseStudentCsv(
      `${HEADER}\n6,1,1,김하나,,X,N\n6,1,2,김두리,,O,N\n6,1,3,김세이,,,N\n6,1,4,김네오,,Y,\n`,
      [3, 4, 5, 6],
    );
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[0]?.message).toContain('학부모동의');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ studentNo: 4, parentConsent: 'Y', isReporter: false });
  });

  it('같은 학년·반·번호가 두 번 나오면 중복 오류', () => {
    const r = parseStudentCsv(`${HEADER}\n3,1,5,김초롱,,Y,N\n3,1,5,김보롱,,Y,N\n`, [3, 4, 5, 6]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3 });
    expect(r.errors[0]?.message).toContain('2번째 줄');
  });

  it('열 순서가 달라도 헤더 이름으로 찾고, 열이 빠지면 첫 줄 오류', () => {
    const r = parseStudentCsv(
      '이름,학년,반,번호,기자단,학부모동의,초기비밀번호\n김초롱,5,1,1,N,Y,\n',
      [3, 4, 5, 6],
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ grade: 5, classNo: 1, studentNo: 1, name: '김초롱' });

    const bad = parseStudentCsv('학년,반,번호,이름\n3,1,1,김초롱\n', [3, 4, 5, 6]);
    expect(bad.errors[0]).toMatchObject({ line: 1 });
    expect(bad.errors[0]?.message).toContain('초기비밀번호');
  });

  it('BOM 이 붙은 UTF-8 텍스트도 헤더를 인식한다', () => {
    const r = parseStudentCsv(
      `${String.fromCharCode(0xfeff)}${HEADER}\n6,1,7,심재이,,N,N\n`,
      [3, 4, 5, 6],
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.parentConsent).toBe('N');
  });
});

// 화면에서 받는 양식(학생등록양식.csv)의 열 이름은 괄호로 설명을 달고 있다.
// 선생님이 받은 파일을 그대로 채워 올려도 읽혀야 한다 (StudentImportPage 의 TEMPLATE_HEADER 와 같은 문자열).
describe('양식 파일 헤더(괄호 설명 포함)', () => {
  const TEMPLATE_HEADER =
    '학년(3-6),반(숫자),번호(출석번호),이름,초기비밀번호(비우면 자동),학부모동의(Y 또는 N),기자단(Y 또는 N)';

  it('괄호 설명이 붙은 열 이름도 그대로 읽는다', () => {
    const r = parseStudentCsv(`${TEMPLATE_HEADER}\n5,3,7,박하늘,,Y,N\n`, [3, 4, 5, 6]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        line: 2,
        grade: 5,
        classNo: 3,
        studentNo: 7,
        name: '박하늘',
        initialPassword: null,
        parentConsent: 'Y',
        isReporter: false,
      },
    ]);
  });

  it('엑셀이 붙이는 BOM 이 있어도 읽는다', () => {
    const r = parseStudentCsv(`\ufeff${TEMPLATE_HEADER}\n6,1,1,최보름,,N,Y\n`, [3, 4, 5, 6]);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.name).toBe('최보름');
    expect(r.rows[0]?.parentConsent).toBe('N');
    expect(r.rows[0]?.isReporter).toBe(true);
  });

  it('양식만 받아 아무것도 안 적고 올리면 빈 결과(오류 아님)', () => {
    const r = parseStudentCsv(`${TEMPLATE_HEADER}\n`, [3, 4, 5, 6]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});
