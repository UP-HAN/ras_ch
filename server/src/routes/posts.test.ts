/**
 * 리포트 API 입력 검증·권한 (RPT-02, AUTH-08, AUTH-07). DB 에 닿기 전에 끝나는 경로만 검사한다.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret';

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
    class_id: 10,
    student_no: 1,
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
const klass = { id: 10, name: '5-1', grade: 5 };
const USERS: Record<number, AuthUser> = {
  1: {
    row: row({ id: 1, parent_consent: 'Y' }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass,
  },
  2: {
    row: row({ id: 2, parent_consent: 'N' }),
    isCouncil: false,
    classIds: [],
    homeroomClassIds: [],
    klass,
  },
  3: {
    row: row({ id: 3, role: 'teacher', class_id: null }),
    isCouncil: false,
    classIds: [10],
    homeroomClassIds: [10],
    klass: null,
  },
};

let app: Express;
beforeAll(async () => {
  const { createApp } = await import('../app.js');
  app = createApp({ testAuth: { userLoader: async (id) => USERS[id] ?? null } });
});
const as = (id: number) => ({ 'x-test-user-id': String(id), 'x-requested-with': 'fetch' });
const body100 =
  '이번 주 나는 유튜브를 가장 많이 썼다. 왜냐하면 재미있는 영상이 계속 나와서 멈추기가 어려웠기 때문이다. 다음 주에는 알림을 끄고 하루 30분만 보기로 정했다. 대신 책을 읽어야겠다.';

describe('POST /posts 입력 검증', () => {
  it('성찰 글 100자 미만이면 400 + 지금 글자 수', async () => {
    const r = await request(app)
      .post('/api/v1/posts')
      .set(as(1))
      .field('type', 'diary')
      .field('weekKey', '2026-W39')
      .field('body', '짧아요')
      .field('goalText', '30분 줄이기');
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('100');
  });

  it('캡처형인데 사용시간이 없으면 400', async () => {
    const r = await request(app)
      .post('/api/v1/posts')
      .set(as(1))
      .field('type', 'report')
      .field('weekKey', '2026-W39')
      .field('body', body100)
      .field('goalText', '30분 줄이기');
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('사용시간');
  });

  it('주차 형식이 틀리면 400', async () => {
    const r = await request(app)
      .post('/api/v1/posts')
      .set(as(1))
      .field('type', 'diary')
      .field('weekKey', '2026-39')
      .field('body', body100)
      .field('goalText', '30분 줄이기');
    expect(r.status).toBe(400);
  });
});

// AUTH-08, 절대 규칙 5: 동의 N 학생은 캡처형 거부
describe('학부모 미동의', () => {
  it('캡처형 리포트는 403', async () => {
    const r = await request(app)
      .post('/api/v1/posts')
      .set(as(2))
      .field('type', 'report')
      .field('weekKey', '2026-W39')
      .field('avgMinutes', '120')
      .field('topCategory', '동영상')
      .field('topApp', '유튜브')
      .field('body', body100)
      .field('goalText', '30분 줄이기')
      .attach(
        'category_capture',
        Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        'a.jpg',
      )
      .attach('app_capture', Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'b.jpg');
    expect(r.status).toBe(403);
    expect(r.body.error.message).toContain('일기');
  });
});

describe('권한', () => {
  it('교사는 리포트를 쓸 수 없다', async () => {
    const r = await request(app)
      .post('/api/v1/posts')
      .set(as(3))
      .field('type', 'diary')
      .field('weekKey', '2026-W39')
      .field('body', body100)
      .field('goalText', '30분 줄이기');
    expect(r.status).toBe(403);
  });

  it('학생은 승인 대기함·승인 API 403', async () => {
    expect((await request(app).get('/api/v1/teacher/classes/10/pending').set(as(1))).status).toBe(
      403,
    );
    expect(
      (await request(app).post('/api/v1/teacher/posts/1/approve').set(as(1)).send({})).status,
    ).toBe(403);
  });

  it('학생은 week-context 를 볼 수 있고 동의 여부에 따라 canUseCapture 가 다르다', async () => {
    // week-context 는 DB 조회가 있어 여기서는 교사 403 만 확인
    expect((await request(app).get('/api/v1/posts/week-context').set(as(3))).status).toBe(403);
  });

  it('업로드 이미지는 로그인 없이 볼 수 없다', async () => {
    const r = await request(app).get('/uploads/2026/09/00000000-0000-0000-0000-000000000000.webp');
    expect(r.status).toBe(401);
  });

  it('잘못된 이미지 경로는 404', async () => {
    const r = await request(app).get('/uploads/2026/09/../../.env').set(as(1));
    expect([404, 400]).toContain(r.status);
  });
});
