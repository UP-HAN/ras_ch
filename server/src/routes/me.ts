import { Router } from 'express';
import { AppError, ok } from '../lib/apiResponse.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { getHome, listNotifications, markNotificationRead, meView } from '../services/MeService.js';

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

  return router;
}
