import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/apiResponse.js';
import { hashPassword } from '../lib/password.js';
import type { UserRow } from '../types/db.js';
import { createAuthService, LOCK_MINUTES, LOCK_THRESHOLD, type AuthDeps } from './AuthService.js';

async function makeUser(over: Partial<UserRow> = {}): Promise<UserRow> {
  return {
    id: 1,
    login_id: '26-5-01-01',
    password_hash: await hashPassword('1234'),
    role: 'student',
    is_approver: 0,
    advisor_grade_group: null,
    name: '류다은',
    display_name: '류○은',
    class_id: 3,
    student_no: 1,
    parent_consent: 'Y',
    consent_updated_at: null,
    is_reporter: 0,
    tier: 'seed',
    linked_council_account_id: null,
    status: 'active',
    must_change_pw: 1,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function fakeDeps(user: UserRow, now = new Date('2026-09-23T10:00:00+09:00')) {
  const calls = {
    failures: [] as Array<Date | null>,
    successes: 0,
    passwords: [] as Array<{ hash: string; mustChange: boolean }>,
  };
  const deps: AuthDeps = {
    findByLoginId: async (id) => (id === user.login_id ? user : null),
    findById: async (id) => (id === user.id ? user : null),
    recordFailure: async (_id, lockedUntil) => {
      user.failed_login_count += 1;
      user.locked_until = lockedUntil;
      calls.failures.push(lockedUntil);
    },
    recordSuccess: async () => {
      user.failed_login_count = 0;
      user.locked_until = null;
      calls.successes += 1;
    },
    updatePassword: async (_id, hash, mustChange) => {
      user.password_hash = hash;
      user.must_change_pw = mustChange ? 1 : 0;
      calls.passwords.push({ hash, mustChange });
    },
    now: () => now,
  };
  return { deps, calls };
}

// AUTH-01, AUTH-06
describe('AuthService.login', () => {
  it('맞는 비밀번호면 성공하고 첫 로그인 여부를 알려 준다', async () => {
    const user = await makeUser();
    const { deps, calls } = fakeDeps(user);
    const r = await createAuthService(deps).login(' 26-5-01-01 ', '1234');
    expect(r.user.id).toBe(1);
    expect(r.mustChangePw).toBe(true);
    expect(calls.successes).toBe(1);
  });

  it('없는 아이디와 틀린 비밀번호는 같은 401 메시지', async () => {
    const user = await makeUser();
    const svc = createAuthService(fakeDeps(user).deps);
    await expect(svc.login('nope', '1234')).rejects.toMatchObject({ status: 401 });
    await expect(svc.login('26-5-01-01', 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('5회 실패하면 10분 잠금(423), 잠금 중엔 맞는 비밀번호도 거부', async () => {
    const user = await makeUser();
    const now = new Date('2026-09-23T10:00:00+09:00');
    const { deps, calls } = fakeDeps(user, now);
    const svc = createAuthService(deps);
    for (let i = 1; i < LOCK_THRESHOLD; i += 1) {
      await expect(svc.login('26-5-01-01', 'wrong')).rejects.toMatchObject({ status: 401 });
    }
    await expect(svc.login('26-5-01-01', 'wrong')).rejects.toMatchObject({
      status: 423,
      code: 'LOCKED',
    });
    expect(calls.failures.at(-1)?.getTime()).toBe(now.getTime() + LOCK_MINUTES * 60000);
    await expect(svc.login('26-5-01-01', '1234')).rejects.toMatchObject({ status: 423 });
  });

  it('잠금이 풀리면 다시 로그인되고 카운터가 0이 된다', async () => {
    const user = await makeUser({
      failed_login_count: 5,
      locked_until: new Date('2026-09-23T10:05:00+09:00'),
    });
    const { deps } = fakeDeps(user, new Date('2026-09-23T10:11:00+09:00'));
    const r = await createAuthService(deps).login('26-5-01-01', '1234');
    expect(r.user.failed_login_count).toBe(0);
  });

  it('비활성 계정은 로그인 불가', async () => {
    const user = await makeUser({ status: 'disabled' });
    await expect(
      createAuthService(fakeDeps(user).deps).login('26-5-01-01', '1234'),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// AUTH-02, AUTH-04
describe('AuthService.changePassword / resetPassword', () => {
  it('현재 비밀번호 확인 → 정책 검사 → must_change_pw 해제', async () => {
    const user = await makeUser();
    const { deps, calls } = fakeDeps(user);
    const svc = createAuthService(deps);
    await expect(svc.changePassword(1, 'wrong', '5678')).rejects.toMatchObject({ status: 400 });
    await expect(svc.changePassword(1, '1234', '12')).rejects.toMatchObject({ status: 400 });
    await expect(svc.changePassword(1, '1234', '1234')).rejects.toMatchObject({ status: 400 });
    await svc.changePassword(1, '1234', '5678');
    expect(calls.passwords[0]?.mustChange).toBe(false);
    expect(user.must_change_pw).toBe(0);
  });

  it('교사는 8자 미만이면 거부', async () => {
    const user = await makeUser({
      role: 'teacher',
      password_hash: await hashPassword('teacher1234!'),
    });
    const svc = createAuthService(fakeDeps(user).deps);
    await expect(svc.changePassword(1, 'teacher1234!', 'short7!')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('초기화는 4자리 숫자+이름 첫 글자 임시 비밀번호를 주고 변경을 강제한다', async () => {
    const user = await makeUser({ must_change_pw: 0 });
    const { deps } = fakeDeps(user);
    const temp = await createAuthService(deps).resetPassword(1);
    expect(temp).toMatch(/^\d{4}류$/);
    expect(user.must_change_pw).toBe(1);
  });

  it('학생이 아니면 초기화 불가', async () => {
    const user = await makeUser({ role: 'teacher' });
    await expect(createAuthService(fakeDeps(user).deps).resetPassword(1)).rejects.toMatchObject({
      status: 404,
    });
  });
});
