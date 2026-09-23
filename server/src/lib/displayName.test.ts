import { describe, expect, it } from 'vitest';
import { assignDisplayNames, maskName } from './displayName.js';

// PRD 3.1 표시 이름 규칙 (절대 규칙 4)
describe('maskName', () => {
  it('3글자 이름: 성 + ○ + 끝 글자', () => {
    expect(maskName('김초롱')).toBe('김○롱');
    expect(maskName('류다은')).toBe('류○은');
  });

  it('2글자 이름: 성 + ○', () => {
    expect(maskName('김하')).toBe('김○');
  });

  it('4글자 이상: 가운데 모두 ○', () => {
    expect(maskName('남궁민수')).toBe('남○○수');
    expect(maskName('황보하늘별')).toBe('황○○○별');
  });

  it('공백은 무시, 1글자·빈 문자열은 그대로', () => {
    expect(maskName(' 김초롱 ')).toBe('김○롱');
    expect(maskName('김')).toBe('김');
    expect(maskName('')).toBe('');
  });
});

describe('assignDisplayNames — 같은 반 중복 시 (번호) 병기', () => {
  it('같은 반에서 마스킹 결과가 같으면 둘 다 번호를 붙인다', () => {
    const out = assignDisplayNames([
      { classId: 1, studentNo: 3, name: '김하늘' },
      { classId: 1, studentNo: 7, name: '김보늘' },
      { classId: 1, studentNo: 9, name: '박서준' },
    ]);
    expect(out.map((o) => o.displayName)).toEqual(['김○늘(3)', '김○늘(7)', '박○준']);
  });

  it('다른 반이면 같은 마스킹이라도 번호를 붙이지 않는다', () => {
    const out = assignDisplayNames([
      { classId: 1, studentNo: 3, name: '김하늘' },
      { classId: 2, studentNo: 3, name: '김보늘' },
    ]);
    expect(out.map((o) => o.displayName)).toEqual(['김○늘', '김○늘']);
  });

  it('실명이 완전히 같은 동명이인도 번호로 구분된다', () => {
    const out = assignDisplayNames([
      { classId: 5, studentNo: 1, name: '이서연' },
      { classId: 5, studentNo: 12, name: '이서연' },
    ]);
    expect(out.map((o) => o.displayName)).toEqual(['이○연(1)', '이○연(12)']);
  });

  it('입력 객체를 그대로 돌려줘 호출자가 id 를 이어 쓸 수 있다', () => {
    const input = [{ classId: 1, studentNo: 1, name: '김초롱', id: 42 }];
    const out = assignDisplayNames(input);
    expect(out[0]?.item.id).toBe(42);
  });
});
