import { Router } from 'express';
import { ok } from '../lib/apiResponse.js';
import {
  loadUser,
  requireFetchHeader,
  requirePasswordChanged,
  type UserLoader,
  loadUserWith,
} from '../middleware/auth.js';
import { createAdminRouter } from './admin.js';
import { createAuthRouter } from './auth.js';
import { createCouncilRouter } from './council.js';
import { createHallOfFameRouter } from './hallOfFame.js';
import { createSettlementsRouter } from './settlements.js';
import { attendance } from '../middleware/attendance.js';
import { createMeRouter } from './me.js';
import { createPostsRouter } from './posts.js';
import { createReactionsRouter } from './reactions.js';
import { createSettingsRouter } from './settings.js';
import { createTeacherRouter } from './teacher.js';

/**
 * /api/v1 라우터. 기능 라우트는 스프린트마다 여기에 mount 한다.
 *  - S1: auth, me, admin, teacher
 *  - S2: posts(report), uploads
 *  - S3: posts(article), comments, likes, reports, me/read
 *  - S4: me/points, council/review, admin/point-rules, admin/approval-settings
 *  - S5: hall-of-fame, admin/settlements, admin/notices
 */
export interface ApiRouterOptions {
  /** 테스트용 사용자 로더 주입 */
  userLoader?: UserLoader;
}

export function createApiRouter(opts: ApiRouterOptions = {}): Router {
  const router = Router();

  router.use(requireFetchHeader); // CSRF (10장)
  router.use(opts.userLoader ? loadUserWith(opts.userLoader) : loadUser);
  router.use(requirePasswordChanged); // AUTH-02
  router.use(attendance); // PT-09 하루 첫 호출 출석

  router.get('/ping', (_req, res) => {
    res.json(ok({ pong: true, time: new Date().toISOString() }));
  });

  router.use('/auth', createAuthRouter());
  router.use('/me', createMeRouter());
  router.use('/admin/settlements', createSettlementsRouter());
  router.use('/admin', createAdminRouter());
  router.use('/hall-of-fame', createHallOfFameRouter());
  router.use('/teacher', createTeacherRouter());
  router.use('/council', createCouncilRouter());
  router.use('/posts', createPostsRouter());
  router.use('/settings', createSettingsRouter());
  router.use('/', createReactionsRouter());

  return router;
}
