import session from 'express-session';
import { env, isProd } from '../config/env.js';
import { MySqlSessionStore } from './MySqlSessionStore.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** 세션에 넣는 값. S1(1-1)에서 로그인 시 채운다 */
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    role?: 'student' | 'teacher' | 'admin' | 'council_teacher';
    /** APR-13 역할 전환: 교사가 자치회 검토 모드일 때 */
    actingAs?: 'teacher' | 'council';
    actingUserId?: number;
  }
}

export function createSessionMiddleware(): ReturnType<typeof session> {
  return session({
    name: 'ras.sid',
    secret: env.SESSION_SECRET,
    store: new MySqlSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: THIRTY_DAYS_MS, // AUTH-01 세션 30일
      path: '/',
    },
  });
}
