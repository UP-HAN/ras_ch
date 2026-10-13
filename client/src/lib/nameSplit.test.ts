import { describe, expect, it } from 'vitest';
import { splitNames } from './nameSplit';

// 줄바꿈 원칙(2026-10-13): 문장 속 표시 이름을 한 덩어리로 묶는다 (3.1 표시 이름 형식)
describe('splitNames', () => {
  it('성○이름, 2글자(성○), 4글자(가운데 ○○), (번호) 를 이름으로 묶는다', () => {
    const parts = splitNames('남궁○○민 친구와 김○, 이○준(3) 친구가 댓글을 달았어요.');
    expect(parts.filter((p) => p.isName).map((p) => p.text)).toEqual([
      '남궁○○민',
      '김○',
      '이○준(3)',
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(
      '남궁○○민 친구와 김○, 이○준(3) 친구가 댓글을 달았어요.',
    );
  });
  it('반 이름이 앞에 있으면 반 이름까지 함께 묶는다', () => {
    const parts = splitNames('학생자치회 · 6-1 류○은(회장)');
    expect(parts.find((p) => p.isName)?.text).toBe('6-1 류○은');
  });
  it('이름이 없으면 그대로 한 조각', () => {
    expect(splitNames('리포트가 승인됐어요.')).toEqual([
      { text: '리포트가 승인됐어요.', isName: false },
    ]);
  });
});
