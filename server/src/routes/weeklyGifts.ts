/**
 * 주간 선물 API (/admin/weekly/:week/gifts, HOF-01a·01b). 승인 권한 교사(approver, admin 포함)
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { sendCsv } from '../lib/csvWrite.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as gifts from '../services/WeeklyGiftService.js';

const weekParam = (raw: unknown): string => String(Array.isArray(raw) ? raw[0] : raw);

export function createWeeklyGiftsRouter(): Router {
  const router = Router();
  router.use(requireRole('approver'));

  router.get('/:week/gifts', async (req, res) => {
    res.json(ok(await gifts.panel(weekParam(req.params.week))));
  });

  router.post('/:week/gifts', async (req, res) => {
    const body = z
      .object({
        topN: z.number().int().optional(),
        userIds: z.array(z.number().int().positive()).max(200).optional(),
        note: z.string().max(200).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) throw AppError.badRequest('선물 대상을 확인해 주세요.');
    res.json(
      ok(await gifts.grant(currentUser(req), weekParam(req.params.week), body.data, clientIp(req))),
    );
  });

  router.delete('/:week/gifts/:userId', async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0)
      throw AppError.badRequest('학생 번호가 올바르지 않아요.');
    res.json(
      ok(await gifts.cancel(currentUser(req), weekParam(req.params.week), userId, clientIp(req))),
    );
  });

  router.get('/:week/gift-list.csv', async (req, res) => {
    const { filename, rows } = await gifts.giftCsv(weekParam(req.params.week));
    sendCsv(res, filename, rows);
  });

  return router;
}
