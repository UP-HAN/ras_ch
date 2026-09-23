/**
 * 로그인·비밀번호 (AUTH-01, 02, 04, 06)
 *  - 5회 실패 시 10분 잠금. 잠금 중에는 비밀번호를 검사하지 않고 423
 *  - 첫 로그인(must_change_pw=1)은 응답에 mustChangePw 로 알리고, 미들웨어가 다른 API를 막는다
 *  - 의존성을 주입받아 DB 없이 테스트한다
 */
import { AppError } from '../lib/apiResponse.js';
import {
  generateTempPassword,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../lib/password.js';
import * as userRepo from '../repos/userRepo.js';
import type { UserRow } from '../types/db.js';

export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 10;

export interface AuthDeps {
  findByLoginId: (loginId: string) => Promise<UserRow | null>;
  findById: (id: number) => Promise<UserRow | null>;
  recordFailure: (id: number, lockedUntil: Date | null) => Promise<void>;
  recordSuccess: (id: number) => Promise<void>;
  updatePassword: (id: number, hash: string, mustChange: boolean) => Promise<void>;
  now: () => Date;
}

const defaultDeps: AuthDeps = {
  findByLoginId: userRepo.findUserByLoginId,
  findById: userRepo.findUserById,
  recordFailure: userRepo.recordLoginFailure,
  recordSuccess: userRepo.recordLoginSuccess,
  updatePassword: userRepo.updatePassword,
  now: () => new Date(),
};

const INVALID = () => AppError.unauthorized('아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.');

export function createAuthService(deps: AuthDeps = defaultDeps) {
  return {
    async login(
      loginIdRaw: string,
      password: string,
    ): Promise<{ user: UserRow; mustChangePw: boolean }> {
      const loginId = (loginIdRaw ?? '').trim();
      if (!loginId || !password) throw INVALID();
      const user = await deps.findByLoginId(loginId);
      if (!user || user.status === 'disabled') throw INVALID();

      const now = deps.now();
      if (user.locked_until && user.locked_until.getTime() > now.getTime()) {
        const minutes = Math.max(
          1,
          Math.ceil((user.locked_until.getTime() - now.getTime()) / 60000),
        );
        throw new AppError(
          423,
          'LOCKED',
          `비밀번호를 여러 번 틀려서 잠겼어요. ${minutes}분 뒤에 다시 해 주세요.`,
        );
      }

      const okPw = await verifyPassword(password, user.password_hash);
      if (!okPw) {
        // 잠금이 풀린 뒤 첫 실패는 1회부터 다시 센다
        const lockExpired = user.locked_until !== null && user.failed_login_count >= LOCK_THRESHOLD;
        const failures = lockExpired ? 1 : user.failed_login_count + 1;
        const lockedUntil =
          failures >= LOCK_THRESHOLD ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null;
        await deps.recordFailure(user.id, lockedUntil);
        if (lockedUntil) {
          throw new AppError(
            423,
            'LOCKED',
            `비밀번호를 ${LOCK_THRESHOLD}번 틀려서 ${LOCK_MINUTES}분 동안 잠겼어요.`,
          );
        }
        throw INVALID();
      }

      await deps.recordSuccess(user.id);
      return { user, mustChangePw: user.must_change_pw === 1 };
    },

    async changePassword(
      userId: number,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const user = await deps.findById(userId);
      if (!user) throw AppError.unauthorized();
      if (!(await verifyPassword(currentPassword ?? '', user.password_hash))) {
        throw AppError.badRequest('지금 쓰는 비밀번호가 맞지 않아요.');
      }
      const policy = validatePasswordPolicy(user.role, newPassword);
      if (!policy.ok) throw AppError.badRequest(policy.message as string);
      if (newPassword === currentPassword)
        throw AppError.badRequest('전과 다른 비밀번호로 정해 주세요.');
      await deps.updatePassword(user.id, await hashPassword(newPassword), false);
    },

    /** 담임·관리자 초기화 (AUTH-04): 임시 비밀번호를 만들어 1회 돌려준다 */
    async resetPassword(studentId: number): Promise<string> {
      const user = await deps.findById(studentId);
      if (!user || user.role !== 'student') throw AppError.notFound('학생을 찾을 수 없어요.');
      const temp = generateTempPassword(user.name);
      await deps.updatePassword(user.id, await hashPassword(temp), true);
      return temp;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

let instance: AuthService | null = null;
export function getAuthService(): AuthService {
  if (!instance) instance = createAuthService();
  return instance;
}
