/**
 * 백업 API 권한·입력 검사 (BKP-04). DB 없이, BACKUP_DIR 미설정(기능 꺼짐) 상태로 돈다.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.BACKUP_DIR = ''; // .env 에 있어도 끈다

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../types/auth.js';
import type { UserRow } from '../types/db.js';

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
    title_code: null,
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
    row: row({ id: 1, role: 'student', class_id: 10 }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass: { id: 10, name: '6-1', grade: 6 },
  },
  2: {
    row: row({ id: 2, role: 'teacher', is_approver: 1 }),
    isCouncil: false,
    classIds: [10],
    homeroomClassIds: [10],
    klass: null,
  },
  3: {
    row: row({ id: 3, role: 'admin' }),
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
const ID = '20261006-033000-manual';

describe('권한 (BKP-04)', () => {
  it('미로그인 401', async () => {
    expect((await request(app).get('/api/v1/admin/backups')).status).toBe(401);
  });
  it('학생·승인 교사 403', async () => {
    expect((await request(app).get('/api/v1/admin/backups').set(as(1))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/backups').set(as(2))).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/backups/${ID}/restore`)
          .set(as(2))
          .send({ confirmId: ID })
      ).status,
    ).toBe(403);
  });
});

describe('기능 꺼짐·입력 검사', () => {
  it('BACKUP_DIR 가 없으면 목록은 enabled:false', async () => {
    const r = await request(app).get('/api/v1/admin/backups').set(as(3));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ enabled: false, points: [] });
  });
  it('만들기는 409 BACKUP_DISABLED', async () => {
    const r = await request(app).post('/api/v1/admin/backups').set(as(3)).send({ label: '테스트' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('BACKUP_DISABLED');
  });
  it('메모가 60자를 넘으면 400', async () => {
    const r = await request(app)
      .post('/api/v1/admin/backups')
      .set(as(3))
      .send({ label: '가'.repeat(61) });
    expect(r.status).toBe(400);
  });
  it('이상한 id 는 400', async () => {
    expect((await request(app).delete('/api/v1/admin/backups/..%2Fetc').set(as(3))).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/admin/backups/nope/restore')
          .set(as(3))
          .send({ confirmId: 'nope' })
      ).status,
    ).toBe(400);
  });
  it('복원 확인 문구가 id 와 다르면 400', async () => {
    const r = await request(app)
      .post(`/api/v1/admin/backups/${ID}/restore`)
      .set(as(3))
      .send({ confirmId: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('그대로 입력');
  });
});
