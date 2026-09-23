import { Router } from 'express';
import { ok } from '../lib/apiResponse.js';

/**
 * /api/v1 라우터. 기능 라우트는 스프린트마다 여기에 mount 한다.
 *  - S1: auth, me, admin/students, admin/teachers
 *  - S2: posts(report), uploads
 *  - S3: posts(article), comments, likes, reports, me/read
 *  - S4: me/points, teacher/*, council/review, admin/point-rules, admin/approval-settings
 *  - S5: hall-of-fame, admin/settlements, admin/notices
 */
export function createApiRouter(): Router {
  const router = Router();

  router.get('/ping', (_req, res) => {
    res.json(ok({ pong: true, time: new Date().toISOString() }));
  });

  return router;
}
