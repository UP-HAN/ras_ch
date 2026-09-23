/**
 * AUTH-07 권한 매트릭스 (절대 규칙 2): 학생이 교사·관리자 API 를 부르면 403, 타 반 교사는 403,
 * 미로그인 401, CSRF 헤더 없는 변경 요청 403, must_change_pw 상태에서 다른 API 403.
 * DB 없이 돈다: 사용자 로더를 주입하고, DB 에 닿기 전에 미들웨어에서 끝나는 경로만 검사한다.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret';

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../types/auth.js';
import type { UserRow } from '../types/db.js';
import { canAccessClass } from './auth.js';

function row(over: Partial<UserRow>): UserRow {
  return {
    id: 0,
    login_id: 'x',
    password_hash: 'h',
    role: 'student',
    is_approver: 0,
    advisor_grade_group: null,
    name: '이름',
    display_name: '이○',
    class_id: null,
    student_no: null,
    parent_consent: 'Y',
    consent_updated_at: null,
    is_reporter: 0,
    tier: 'seed',
    linked_council_account_id: null,
    status: 'active',
    must_change_pw: 0,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

const USERS: Record<number, AuthUser> = {
  1: {
    row: row({ id: 1, role: 'student', class_id: 10, student_no: 3 }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: { id: 10, name: '5-1', grade: 5 },
  },
  2: {
    row: row({ id: 2, role: 'teacher' }),
    isCouncil: false,
    classIds: [10],
    homeroomClassIds: [10],
    klass: null,
  },
  3: {
    row: row({ id: 3, role: 'admin', is_approver: 1 }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: null,
  },
  4: {
    row: row({ id: 4, role: 'student', must_change_pw: 1, class_id: 10 }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: { id: 10, name: '5-1', grade: 5 },
  },
  5: {
    row: row({ id: 5, role: 'teacher', advisor_grade_group: '3-4' }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: null,
  },
  6: {
    row: row({ id: 6, role: 'teacher', is_approver: 1 }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: null,
  },
};

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../app.js');
  app = createApp({ testAuth: { userLoader: async (id) => USERS[id] ?? null } });
});

const as = (id: number) => ({ 'x-test-user-id': String(id), 'x-requested-with': 'fetch' });

describe('CSRF 헤더 (10장)', () => {
  it('변경 요청에 X-Requested-With 가 없으면 403', async () => {
    const r = await request(app).post('/api/v1/auth/logout').send({});
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF');
  });

  it('GET 은 헤더 없이도 통과', async () => {
    const r = await request(app).get('/api/v1/ping');
    expect(r.status).toBe(200);
  });
});

describe('로그인 필요', () => {
  it('미로그인 /me 는 401', async () => {
    const r = await request(app).get('/api/v1/me');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
  });

  it('로그인 학생의 /me 는 마스킹 이름과 실명(본인)을 준다', async () => {
    const r = await request(app).get('/api/v1/me').set(as(1));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      id: 1,
      role: 'student',
      displayName: '이○',
      className: '5-1',
    });
  });
});

describe('AUTH-07 역할별 403', () => {
  it('학생 → 교사 API 403', async () => {
    const r = await request(app).get('/api/v1/teacher/classes').set(as(1));
    expect(r.status).toBe(403);
  });

  it('학생 → 관리자 API 403', async () => {
    const r = await request(app).get('/api/v1/admin/teachers').set(as(1));
    expect(r.status).toBe(403);
  });

  it('학생 → 타 학생 비밀번호 초기화 403', async () => {
    const r = await request(app)
      .post('/api/v1/teacher/students/9/reset-password')
      .set(as(1))
      .send({});
    expect(r.status).toBe(403);
  });

  it('일반 교사 → 관리자 API 403', async () => {
    const r = await request(app)
      .post('/api/v1/admin/classes')
      .set(as(2))
      .send({ grade: 3, classNo: 9 });
    expect(r.status).toBe(403);
  });

  it('교사 → 담당하지 않는 반 학생 목록 403', async () => {
    const r = await request(app).get('/api/v1/teacher/classes/99/students').set(as(2));
    expect(r.status).toBe(403);
  });

  it('반 번호가 숫자가 아니면 400', async () => {
    const r = await request(app).get('/api/v1/teacher/classes/abc/students').set(as(2));
    expect(r.status).toBe(400);
  });
});

describe('AUTH-02 비밀번호 변경 강제', () => {
  it('must_change_pw 학생은 /me 는 되고 다른 API 는 403 MUST_CHANGE_PW', async () => {
    const me = await request(app).get('/api/v1/me').set(as(4));
    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePw).toBe(true);
    const home = await request(app).get('/api/v1/me/home').set(as(4));
    expect(home.status).toBe(403);
    expect(home.body.error.code).toBe('MUST_CHANGE_PW');
  });
});

describe('canAccessClass (반 범위)', () => {
  const grade = async (id: number) => (id === 10 ? 5 : id === 20 ? 3 : null);

  it('담임·배정 반만 허용', async () => {
    expect(await canAccessClass(USERS[2] as AuthUser, 10, grade)).toBe(true);
    expect(await canAccessClass(USERS[2] as AuthUser, 20, grade)).toBe(false);
  });

  it('admin·approver 는 전 반', async () => {
    expect(await canAccessClass(USERS[3] as AuthUser, 20, grade)).toBe(true);
    expect(await canAccessClass(USERS[6] as AuthUser, 20, grade)).toBe(true);
  });

  it('학년군 지도교사(3-4)는 3학년 반만', async () => {
    expect(await canAccessClass(USERS[5] as AuthUser, 20, grade)).toBe(true);
    expect(await canAccessClass(USERS[5] as AuthUser, 10, grade)).toBe(false);
  });

  it('학생은 항상 불가', async () => {
    expect(await canAccessClass(USERS[1] as AuthUser, 10, grade)).toBe(false);
  });
});
