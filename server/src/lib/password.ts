/**
 * 비밀번호 정책·해시 (AUTH-02, 3.1)
 *  - 학생 4자 이상, 교사·관리자·검토 계정 8자 이상, 최대 64자
 *  - 초기 비밀번호 자동 생성: 4자리 숫자 + 이름 첫 글자
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { Role } from '../types/db.js';

const BCRYPT_ROUNDS = 10;
export const PASSWORD_MAX = 64;

export function minPasswordLength(role: Role): number {
  return role === 'student' ? 4 : 8;
}

export interface PolicyResult {
  ok: boolean;
  message?: string;
}

export function validatePasswordPolicy(role: Role, password: string): PolicyResult {
  const min = minPasswordLength(role);
  if (typeof password !== 'string' || password.length < min) {
    return { ok: false, message: `비밀번호는 ${min}자 이상이어야 해요.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, message: `비밀번호는 ${PASSWORD_MAX}자까지만 쓸 수 있어요.` };
  }
  if (/\s/.test(password)) {
    return { ok: false, message: '비밀번호에 띄어쓰기는 넣을 수 없어요.' };
  }
  return { ok: true };
}

/** 4자리 숫자 + 이름 첫 글자 (예: "4821김") */
export function generateInitialPassword(name: string): string {
  const digits = String(randomInt(0, 10000)).padStart(4, '0');
  const first = Array.from(name.trim())[0] ?? '';
  return `${digits}${first}`;
}

/** 담임 초기화용 임시 비밀번호: 4자리 숫자 + 이름 첫 글자 (같은 규칙) */
export const generateTempPassword = generateInitialPassword;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
