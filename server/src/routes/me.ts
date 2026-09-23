import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { attendanceSummary } from '../services/AttendanceService.js';
import { getHome, listNotifications, markNotificationRead, meView } from '../services/MeService.js';
import { completeRead, openRead } from '../services/ReadService.js';

export function createMeRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const user = currentUser(req);
    res.json(ok(meView(user, req.session.actingAs ?? null)));
  });

  // 학생 홈 카드 묶음 (6.1)
  router.get('/home', async (req, res) => {
    const user = currentUser(req);
    res.json(ok(await getHome(user, req.session.actingAs ?? null)));
  });

  router.get('/notifications', async (req, res) => {
    const user = currentUser(req);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    res.json(ok(await listNotifications(user.row.id, limit)));
  });

  router.post('/notifications/:id/read', async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('알림 번호가 올바르지 않아요.');
    res.json(ok({ read: await markNotificationRead(user.row.id, id) }));
  });

  // PT-09 출석
  router.get('/attendance', async (req, res) => {
    res.json(ok(await attendanceSummary(currentUser(req))));
  });

  // PT-10 읽기: 열람 시작(서버 시각) → 10초 + 끝까지 스크롤 후 완료
  const readSchema = z.object({
    targetType: z.literal('post'),
    targetId: z.number().int().positive(),
    scrolledToEnd: z.boolean().optional(),
  });

  router.post('/read/open', async (req, res) => {
    const body = readSchema.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('읽기 대상이 올바르지 않아요.');
    res.json(ok(await openRead(currentUser(req), body.data.targetId)));
  });

  router.post('/read/complete', async (req, res) => {
    const body = readSchema.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('읽기 대상이 올바르지 않아요.');
    res.json(
      ok(
        await completeRead(currentUser(req), body.data.targetId, body.data.scrolledToEnd === true),
      ),
    );
  });

  return router;
}
