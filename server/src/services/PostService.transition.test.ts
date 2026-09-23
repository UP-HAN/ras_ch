process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import {
  nextStatus,
  resolveRejectReason,
  STUDENT_ACTIONS,
  TEACHER_ACTIONS,
  TRANSITIONS,
} from './PostService.js';

// RPT-06 상태 흐름: draft → pending → [reviewed | flagged] → approved | rejected | hidden
describe('TRANSITIONS / nextStatus', () => {
  it('제출: draft 만 pending 으로', () => {
    expect(nextStatus('submit', 'draft')).toBe('pending');
    expect(() => nextStatus('submit', 'pending')).toThrow(/할 수 없는/);
  });

  it('승인·반려는 pending·reviewed·flagged 에서만', () => {
    for (const s of ['pending', 'reviewed', 'flagged'] as const) {
      expect(nextStatus('approve', s)).toBe('approved');
      expect(nextStatus('reject', s)).toBe('rejected');
    }
    expect(() => nextStatus('approve', 'approved')).toThrow();
    expect(() => nextStatus('approve', 'draft')).toThrow();
    expect(() => nextStatus('reject', 'rejected')).toThrow();
  });

  it('수정 후 재제출은 반려된 글도 pending 으로(1차 검토 결과 초기화는 patch 에서)', () => {
    expect(nextStatus('resubmit', 'rejected')).toBe('pending');
    expect(nextStatus('resubmit', 'flagged')).toBe('pending');
    expect(() => nextStatus('resubmit', 'approved')).toThrow();
  });

  it('숨김은 approved 에서만, 해제는 hidden 에서만', () => {
    expect(nextStatus('hide', 'approved')).toBe('hidden');
    expect(() => nextStatus('hide', 'pending')).toThrow();
    expect(nextStatus('unhide', 'hidden')).toBe('approved');
  });

  it('삭제는 어느 상태에서나 상태를 유지한 채 소프트 삭제', () => {
    for (const s of TRANSITIONS.delete.from) expect(nextStatus('delete', s)).toBe(s);
  });

  it('학생·교사 액션 분리', () => {
    expect(STUDENT_ACTIONS).toEqual(['submit', 'resubmit', 'delete']);
    expect(TEACHER_ACTIONS).toContain('approve');
    expect(TEACHER_ACTIONS).not.toContain('submit');
  });
});

describe('resolveRejectReason', () => {
  it('프리셋은 쉬운 문구, other 는 5~200자 직접 입력', () => {
    expect(resolveRejectReason({ reasonCode: 'too_short' })).toContain('100자');
    expect(resolveRejectReason({ reasonCode: 'other', reasonText: '이름이 보이는 캡처예요' })).toBe(
      '이름이 보이는 캡처예요',
    );
    expect(() => resolveRejectReason({ reasonCode: 'other', reasonText: '짧음' })).toThrow();
    expect(() => resolveRejectReason({})).toThrow();
  });
});
