/**
 * 명예의 전당 API (9.3, HOF-06). 로그인만 필요. 학생 응답은 마스킹 이름·순위 없음
 */
import { Router } from 'express';
import { ok } from '../lib/apiResponse.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import * as hall from '../services/HallOfFameService.js';

export function createHallOfFameRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/weekly', async (req, res) => {
    const week = typeof req.query.week === 'string' ? req.query.week : undefined;
    res.json(ok(await hall.weeklyTop(currentUser(req), week)));
  });
  router.get('/monthly', async (req, res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    res.json(ok(await hall.monthly(currentUser(req), month)));
  });
  router.get('/classes', async (_req, res) => {
    res.json(ok(await hall.classHall()));
  });
  router.get('/all-time', async (req, res) => {
    res.json(ok(await hall.allTime(currentUser(req))));
  });
  return router;
}
