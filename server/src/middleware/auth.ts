/**
 * 인증·권한 미들웨어 (AUTH-02, AUTH-07, 절대 규칙 2)
 *  - loadUser            : 세션 userId → req.user (요청마다 1회 조회)
 *  - requireAuth         : 로그인 필요(401)
 *  - requireRole(...)    : 역할 중 하나라도 있어야 통과(403). admin 은 교사 계열 전부 포함
 *  - requireClassAccess  : /:id 반에 대한 교사 권한(담임·배정·admin·approver·학년군 지도교사)
 *  - requirePasswordChanged : must_change_pw=1 이면 변경 API 외 전부 403 MUST_CHANGE_PW
 *  - requireFetchHeader  : 상태 변경 요청은 X-Requested-With: fetch 필수(CSRF, 10장)
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../lib/apiResponse.js';
import { findClassById } from '../repos/classRepo.js';
import { loadAuthUser } from '../repos/userRepo.js';
import { advisorGrades, hasRole, type AppRole, type AuthUser } from '../types/auth.js';

export type UserLoader = (userId: number) => Promise<AuthUser | null>;

export function loadUserWith(loader: UserLoader): RequestHandler {
  return async (req, _res, next) => {
    const userId = req.session?.userId;
    if (!userId) return next();
    const user = await loader(userId);
    if (!user) {
      // 비활성·삭제된 계정: 세션 폐기
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      return next();
    }
    req.user = user;
    next();
  };
}

export const loadUser: RequestHandler = loadUserWith(loadAuthUser);

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  next();
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (roles.some((r) => hasRole(req.user as AuthUser, r))) return next();
    next(AppError.forbidden());
  };
}

/** 교사가 특정 반에 접근할 수 있는가 (AUTH-07: 타 반 관리 API 403) */
export async function canAccessClass(
  user: AuthUser,
  classId: number,
  classGradeLookup: (id: number) => Promise<number | null> = async (id) =>
    (await findClassById(id))?.grade ?? null,
): Promise<boolean> {
  if (user.row.role === 'student' || user.row.role === 'council_teacher') return false;
  if (hasRole(user, 'admin') || hasRole(user, 'approver')) return true;
  if (user.classIds.includes(classId)) return true;
  const grades = advisorGrades(user);
  if (grades.length > 0) {
    const grade = await classGradeLookup(classId);
    if (grade !== null && grades.includes(grade)) return true;
  }
  return false;
}

export function requireClassAccess(param = 'id'): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const raw = req.params[param];
    const classId = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isInteger(classId) || classId <= 0)
      return next(AppError.badRequest('반 번호가 올바르지 않아요.'));
    if (await canAccessClass(req.user, classId)) return next();
    next(AppError.forbidden('이 반을 관리할 권한이 없어요.'));
  };
}

/** must_change_pw 상태에서 허용되는 경로 (라우터 기준 상대 경로) */
const PASSWORD_CHANGE_ALLOWLIST = new Set([
  '/auth/login',
  '/auth/logout',
  '/auth/change-password',
  '/me',
  '/ping',
]);

export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.row.must_change_pw !== 1) return next();
  const path = req.path.replace(/\/+$/, '') || '/';
  if (PASSWORD_CHANGE_ALLOWLIST.has(path)) return next();
  next(new AppError(403, 'MUST_CHANGE_PW', '먼저 새 비밀번호를 정해 주세요.'));
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireFetchHeader(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const h = req.get('x-requested-with');
  if (h && h.toLowerCase() === 'fetch') return next();
  next(new AppError(403, 'CSRF', '요청 형식이 올바르지 않아요. 앱에서 다시 시도해 주세요.'));
}

export function clientIp(req: Request): string {
  return req.ip ?? '';
}
