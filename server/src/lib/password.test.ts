import { describe, expect, it } from 'vitest';
import {
  generateInitialPassword,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from './password.js';

// AUTH-02: 학생 4자 이상, 교사 8자 이상
describe('validatePasswordPolicy', () => {
  it('학생은 4자부터 허용', () => {
    expect(validatePasswordPolicy('student', '123').ok).toBe(false);
    expect(validatePasswordPolicy('student', '1234').ok).toBe(true);
  });

  it('교사·관리자·검토 계정은 8자부터 허용', () => {
    expect(validatePasswordPolicy('teacher', '1234567').ok).toBe(false);
    expect(validatePasswordPolicy('teacher', '12345678').ok).toBe(true);
    expect(validatePasswordPolicy('admin', 'short').ok).toBe(false);
    expect(validatePasswordPolicy('council_teacher', 'longenough').ok).toBe(true);
  });

  it('띄어쓰기·64자 초과는 거부하고 이유를 한국어로 준다', () => {
    expect(validatePasswordPolicy('student', '12 34')).toMatchObject({ ok: false });
    expect(validatePasswordPolicy('student', 'a'.repeat(65)).message).toContain('64자');
    expect(validatePasswordPolicy('student', '12').message).toContain('4자 이상');
  });
});

describe('generateInitialPassword', () => {
  it('4자리 숫자 + 이름 첫 글자', () => {
    expect(generateInitialPassword('김초롱')).toMatch(/^\d{4}김$/);
    expect(generateInitialPassword(' 남궁민수 ')).toMatch(/^\d{4}남$/);
  });
});

describe('hash / verify', () => {
  it('bcrypt 해시는 원문과 다르고 검증에 성공한다', async () => {
    const hash = await hashPassword('1234');
    expect(hash).not.toBe('1234');
    expect(await verifyPassword('1234', hash)).toBe(true);
    expect(await verifyPassword('1235', hash)).toBe(false);
  });
});
