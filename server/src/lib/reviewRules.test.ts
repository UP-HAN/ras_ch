import { describe, expect, it } from 'vitest';
import {
  expandPostTypes,
  holdNoteValid,
  resultAllowed,
  reviewQueueFilter,
  type ReviewablePost,
  type ReviewerContext,
} from './reviewRules.js';

const student: ReviewerContext = {
  id: 21,
  kind: 'student',
  classId: 3,
  grades: [3, 4],
  postTypes: ['report', 'article'],
};
const teacherAcc: ReviewerContext = {
  id: 90,
  kind: 'teacher',
  classId: null,
  grades: [3, 4, 5, 6],
  postTypes: ['report'],
};
const post = (over: Partial<ReviewablePost> = {}): ReviewablePost => ({
  author_id: 100,
  class_id: 1,
  grade: 3,
  type: 'report',
  status: 'pending',
  ...over,
});

// APR-02, 02c, 06: 본인·같은 반 제외, 담당 학년·유형, teacher_only 반 제외
describe('reviewQueueFilter', () => {
  it('담당 학년의 pending 글은 보인다', () => {
    expect(reviewQueueFilter(student, post(), 'two_step')).toBe(true);
    expect(reviewQueueFilter(student, post({ type: 'diary' }), 'two_step')).toBe(true);
  });
  it('본인 글·같은 반 글은 학생 검토자에게 안 보인다', () => {
    expect(reviewQueueFilter(student, post({ author_id: 21 }), 'two_step')).toBe(false);
    expect(reviewQueueFilter(student, post({ class_id: 3 }), 'two_step')).toBe(false);
  });
  it('교사 검토 계정은 같은 반 제외 규칙이 없다 (APR-12)', () => {
    expect(reviewQueueFilter(teacherAcc, post({ class_id: 3 }), 'two_step')).toBe(true);
    expect(reviewQueueFilter(teacherAcc, post({ type: 'article' }), 'two_step')).toBe(false);
  });
  it('담당 아닌 학년·pending 아닌 상태·teacher_only 반은 제외', () => {
    expect(reviewQueueFilter(student, post({ grade: 5 }), 'two_step')).toBe(false);
    expect(reviewQueueFilter(student, post({ status: 'reviewed' }), 'two_step')).toBe(false);
    expect(reviewQueueFilter(student, post(), 'teacher_only')).toBe(false);
  });
});

describe('기타 규칙', () => {
  it('report 유형은 일기형을 포함', () => {
    expect(expandPostTypes(['report'])).toEqual(['report', 'diary']);
    expect(expandPostTypes(['article'])).toEqual(['article']);
  });
  it('보류 사유 20자', () => {
    expect(holdNoteValid('짧아요')).toBe(false);
    expect(holdNoteValid('캡처에 이름이 보여요. 다시 캡처해서 올려 주세요.')).toBe(true);
  });
  it('pass_only 담당은 보류 요청 불가 (APR-02a)', () => {
    expect(resultAllowed('pass_only', 'hold')).toBe(false);
    expect(resultAllowed('pass_only', 'pass')).toBe(true);
    expect(resultAllowed('pass_hold', 'hold')).toBe(true);
  });
});
