import { describe, expect, it } from 'vitest';
import { AppError } from './apiResponse.js';
import {
  BUG_LIMITS,
  canViewReport,
  isBugStatus,
  normalizePagePath,
  validateBugInput,
  validateReply,
} from './bugReportRules.js';

const ok = {
  title: '글쓰기 화면이 안 열려요',
  body: '리포트를 쓰려고 눌렀는데 하얀 화면만 나와요.',
  pagePath: '/write/report',
};

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.message : String(e);
  }
  return '';
};

// BUG-01
describe('validateBugInput', () => {
  it('정상 입력은 앞뒤 공백만 다듬어 돌려준다', () => {
    expect(validateBugInput({ ...ok, title: '  제목이에요  ', body: '  내용이에요  ' })).toEqual({
      title: '제목이에요',
      body: '내용이에요',
      pagePath: '/write/report',
    });
  });

  it(`제목은 ${BUG_LIMITS.titleMin}~${BUG_LIMITS.titleMax}자`, () => {
    expect(message(() => validateBugInput({ ...ok, title: '가' }))).toContain('제목');
    expect(message(() => validateBugInput({ ...ok, title: '가'.repeat(101) }))).toContain('제목');
    expect(validateBugInput({ ...ok, title: '가'.repeat(100) }).title).toHaveLength(100);
  });

  it(`내용은 ${BUG_LIMITS.bodyMin}~${BUG_LIMITS.bodyMax}자`, () => {
    expect(message(() => validateBugInput({ ...ok, body: '가나다라' }))).toContain('내용');
    expect(message(() => validateBugInput({ ...ok, body: '가'.repeat(2001) }))).toContain('내용');
    expect(validateBugInput({ ...ok, body: '가'.repeat(2000) }).body).toHaveLength(2000);
  });

  it('길이는 글자 수로 센다 (이모지 1자)', () => {
    // 제목 100자 제한: 이모지 100개는 통과, 101개는 거부
    expect(validateBugInput({ ...ok, title: '🙂'.repeat(100) }).pagePath).toBe('/write/report');
    expect(message(() => validateBugInput({ ...ok, title: '🙂'.repeat(101) }))).toContain('제목');
  });

  it('공백만 있는 입력은 거부한다', () => {
    expect(message(() => validateBugInput({ ...ok, body: '     ' }))).toContain('내용');
  });
});

// BUG-01, BUG-05: 외부 URL·주입 차단
describe('normalizePagePath', () => {
  it('앱 내부 경로는 그대로 둔다', () => {
    expect(normalizePagePath('/posts/12')).toBe('/posts/12');
    expect(normalizePagePath('/teacher/admin/backups')).toBe('/teacher/admin/backups');
    expect(normalizePagePath('/posts?class=3')).toBe('/posts?class=3');
    expect(normalizePagePath('  /me  ')).toBe('/me');
    expect(normalizePagePath('/')).toBe('/');
  });

  it('외부로 나가는 주소는 버린다', () => {
    expect(normalizePagePath('//evil.example.com/x')).toBeNull();
    expect(normalizePagePath('https://evil.example.com')).toBeNull();
    expect(normalizePagePath('javascript:alert(1)')).toBeNull();
    expect(normalizePagePath('posts/12')).toBeNull(); // 슬래시로 시작하지 않음
  });

  it('따옴표·꺾쇠·공백이 섞이면 버린다', () => {
    expect(normalizePagePath('/posts"><script>alert(1)</script>')).toBeNull();
    expect(normalizePagePath("/posts'")).toBeNull();
    expect(normalizePagePath('/posts 12')).toBeNull();
  });

  it('비었거나 너무 길거나 문자열이 아니면 null', () => {
    expect(normalizePagePath('')).toBeNull();
    expect(normalizePagePath('   ')).toBeNull();
    expect(normalizePagePath(null)).toBeNull();
    expect(normalizePagePath(undefined)).toBeNull();
    expect(normalizePagePath('/' + 'a'.repeat(BUG_LIMITS.pagePathMax))).toBeNull();
  });
});

// BUG-03
describe('validateReply', () => {
  it('빈 답변은 null 로 본다', () => {
    expect(validateReply(null)).toBeNull();
    expect(validateReply('   ')).toBeNull();
  });
  it('앞뒤 공백을 다듬는다', () => {
    expect(validateReply('  고쳤어요.  ')).toBe('고쳤어요.');
  });
  it(`${BUG_LIMITS.replyMax}자를 넘으면 거부한다`, () => {
    expect(validateReply('가'.repeat(2000))).toHaveLength(2000);
    expect(message(() => validateReply('가'.repeat(2001)))).toContain('답변');
  });
});

// BUG-02, BUG-05
describe('canViewReport', () => {
  it('신고자 본인은 볼 수 있다', () => {
    expect(canViewReport({ id: 7, isAdmin: false }, 7)).toBe(true);
  });
  it('남의 신고는 볼 수 없다', () => {
    expect(canViewReport({ id: 7, isAdmin: false }, 8)).toBe(false);
  });
  it('관리자는 전부 볼 수 있다', () => {
    expect(canViewReport({ id: 1, isAdmin: true }, 8)).toBe(true);
  });
});

describe('isBugStatus', () => {
  it('정해진 값만 참', () => {
    expect(isBugStatus('received')).toBe(true);
    expect(isBugStatus('held')).toBe(true);
    expect(isBugStatus('done')).toBe(false);
    expect(isBugStatus(3)).toBe(false);
    expect(isBugStatus(null)).toBe(false);
  });
});
