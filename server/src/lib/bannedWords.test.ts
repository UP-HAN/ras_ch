import { describe, expect, it } from 'vitest';
import { findBannedWords, normalizeForBanned } from './bannedWords.js';

const WORDS = ['바보', '멍청이', 'idiot'];

// RCT-04
describe('findBannedWords', () => {
  it('그대로 들어 있으면 잡는다', () => {
    expect(findBannedWords('너 진짜 바보야', WORDS)).toEqual(['바보']);
  });

  it('띄어쓰기·기호로 피해 가도 잡는다', () => {
    expect(findBannedWords('바 보', WORDS)).toEqual(['바보']);
    expect(findBannedWords('멍.청.이!!', WORDS)).toEqual(['멍청이']);
    expect(findBannedWords('IDIOT', WORDS)).toEqual(['idiot']);
  });

  it('없으면 빈 배열, 여러 개면 모두', () => {
    expect(findBannedWords('오늘 리포트 잘 썼네! 응원해', WORDS)).toEqual([]);
    expect(findBannedWords('바보 멍청이', WORDS)).toEqual(['바보', '멍청이']);
  });

  it('normalize', () => {
    expect(normalizeForBanned(' A b_c! ')).toBe('abc');
  });
});
