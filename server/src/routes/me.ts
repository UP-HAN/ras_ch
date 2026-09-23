import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { attendanceSummary } from '../services/AttendanceService.js';
import { getHome, listNotifications, markNotificationRead, meView } from '../services/MeService.js';
import { pointsSummary } from '../services/PointsQueryService.js';
import { completeRead, openRead } from '../services/ReadService.js';
import { writeAudit } from '../repos/auditRepo.js';
import { clientIp } from '../middleware/auth.js';

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

  // PT-06 내 포인트: 합계 3종 + 내역(회수 행 포함)
  router.get('/points', async (req, res) => {
    const range =
      req.query.range === 'month' || req.query.range === 'all' ? req.query.range : 'week';
    res.json(ok(await pointsSummary(currentUser(req).row.id, range)));
  });

  // APR-13 역할 전환: 교사 ↔ 자치회 검토 계정. 세션 userId 는 원 교사로 유지
  router.post('/switch-role', async (req, res) => {
    const body = z.object({ to: z.enum(['teacher', 'council']) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('전환할 화면을 골라 주세요.');
    const user = currentUser(req);
    if (body.data.to === 'council') {
      if (user.row.role !== 'teacher' && user.row.role !== 'admin')
        throw AppError.forbidden('선생님만 검토 모드로 바꿀 수 있어요.');
      if (!user.row.linked_council_account_id)
        throw AppError.conflict(
          '연결된 자치회 검토 계정이 없어요. 관리자에게 만들어 달라고 하세요.',
        );
      req.session.actingAs = 'council';
    } else {
      if (req.session.actingAs !== 'council') return res.json(ok({ actingAs: null }));
      req.session.actingAs = undefined;
      req.session.actingUserId = undefined;
    }
    await writeAudit({
      actorId: req.session.userId ?? user.row.id,
      action: `me.switch_role.${body.data.to}`,
      ip: clientIp(req),
    });
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    res.json(ok({ actingAs: req.session.actingAs === 'council' ? 'council' : null }));
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
