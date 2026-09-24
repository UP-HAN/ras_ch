process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import { findInformalSentences, politeWarning } from './politeness.js';

describe('존댓말 원칙 — 반말 문장 찾기', () => {
  it('존댓말 문장은 잡지 않는다', () => {
    expect(
      findInformalSentences(
        '이번 주에는 유튜브를 제일 많이 봤어요. 다음 주에는 자동 재생을 끄겠습니다. 같이 지켜요! 궁금한 건 물어보세요. 정말 재밌죠? 몇 시에 끝날까요?',
      ),
    ).toEqual([]);
  });
  it('반말 어미로 끝나는 문장을 찾는다', () => {
    const hits = findInformalSentences(
      '이번 주에는 유튜브를 제일 많이 봤다. 다음 주에는 자동 재생을 끌 거야. 같이 지켜요.',
    );
    expect(hits).toEqual([
      '이번 주에는 유튜브를 제일 많이 봤다.',
      '다음 주에는 자동 재생을 끌 거야.',
    ]);
  });
  it('~합니다/~습니다 는 존댓말', () => {
    expect(findInformalSentences('저는 찬성합니다. 이유는 이렇습니다.')).toEqual([]);
  });
  it('개조식 명사형·숫자·이모지 문장은 넘어간다', () => {
    expect(
      findInformalSentences(
        '📌 무엇을 하나요?\n- 자기 전 폰 거실에 두기\n- 10월 6일(월) ~ 17일(금)\n🎁',
      ),
    ).toEqual([]);
  });
  it('따옴표·이모지 뒤 어미도 본다', () => {
    expect(findInformalSentences('엄마가 "오늘 표정이 밝다"고 하셨어요. 진짜 좋았다! 🎉')).toEqual([
      '진짜 좋았다!',
    ]);
  });
  it('안내 문구', () => {
    expect(politeWarning('오늘은 폰을 안 봤어요.')).toBeNull();
    expect(politeWarning('오늘은 폰을 안 봤다.')).toMatch(/존댓말/);
  });
});
