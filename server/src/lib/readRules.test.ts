import { describe, expect, it } from 'vitest';
import { isReadComplete } from './readRules.js';

// PT-10: 10초 이상 + 끝까지 스크롤, 같은 글 1회
describe('isReadComplete', () => {
  const opened = new Date('2026-09-24T09:00:00+09:00');
  it('9초는 거부', () => {
    expect(isReadComplete(opened, new Date(opened.getTime() + 9000), true, false)).toEqual({
      ok: false,
      reason: 'TOO_FAST',
    });
  });
  it('10초 + 스크롤 완료면 통과', () => {
    expect(isReadComplete(opened, new Date(opened.getTime() + 10000), true, false)).toEqual({
      ok: true,
    });
  });
  it('스크롤 안 했으면 거부', () => {
    expect(isReadComplete(opened, new Date(opened.getTime() + 60000), false, false)).toEqual({
      ok: false,
      reason: 'NOT_SCROLLED',
    });
  });
  it('이미 완료한 글은 거부', () => {
    expect(isReadComplete(opened, new Date(opened.getTime() + 60000), true, true)).toEqual({
      ok: false,
      reason: 'ALREADY_DONE',
    });
  });
});
