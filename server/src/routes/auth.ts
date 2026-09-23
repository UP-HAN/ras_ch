import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { logger } from '../lib/logger.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { loadAuthUser } from '../repos/userRepo.js';
import { getAuthService } from '../services/AuthService.js';
import { meView } from '../services/MeService.js';
import type { LoginResult } from '../types/api.js';

const loginSchema = z.object({
  loginId: z.string().min(1).max(64),
  password: z.string().min(1).max(64),
});
const changeSchema = z.object({
  currentPassword: z.string().max(64),
  newPassword: z.string().max(64),
});

export function createAuthRouter(): Router {
  const router = Router();
  const auth = getAuthService();

  // AUTH-01 로그인 → 세션 재생성(세션 고정 방지) → 사용자 정보
  router.post('/login', async (req, res) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('아이디와 비밀번호를 입력해 주세요.');
    const { user, mustChangePw } = await auth.login(body.data.loginId, body.data.password);

    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = user.id;
    req.session.role = user.role;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    const authUser = await loadAuthUser(user.id);
    if (!authUser) throw AppError.unauthorized();
    logger.info({ userId: user.id, role: user.role }, 'login');
    const data: LoginResult = { me: meView(authUser, null), mustChangePw };
    res.json(ok(data));
  });

  router.post('/logout', async (req, res) => {
    const userId = req.session?.userId;
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie('ras.sid', { path: '/' });
    if (userId) logger.info({ userId }, 'logout');
    res.json(ok({ loggedOut: true }));
  });

  // AUTH-02 첫 로그인 비밀번호 변경(강제) 및 일반 변경
  router.post('/change-password', requireAuth, async (req, res) => {
    const body = changeSchema.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('비밀번호를 입력해 주세요.');
    const user = currentUser(req);
    await auth.changePassword(user.row.id, body.data.currentPassword, body.data.newPassword);
    res.json(ok({ changed: true }));
  });

  return router;
}
