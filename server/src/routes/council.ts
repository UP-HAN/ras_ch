/**
 * 자치회 1차 검토 API (9.4 /council/review/*). 임원 학생(council) 또는 교사 검토 계정(council_teacher).
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as review from '../services/ReviewService.js';

export function createCouncilRouter(): Router {
  const router = Router();

  // 요약은 로그인만 필요(홈 카드용). 임원이 아니면 hasAssignment=false
  router.get('/review/summary', async (req, res) => {
    res.json(ok(await review.reviewSummary(currentUser(req))));
  });

  router.use(requireRole('council', 'council_teacher'));

  router.get('/review/queue', async (req, res) => {
    res.json(ok(await review.reviewQueue(currentUser(req))));
  });

  router.get('/review/posts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    res.json(ok(await review.reviewPost(currentUser(req), id)));
  });

  router.post('/review/posts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    const body = z
      .object({
        result: z.enum(['pass', 'hold']),
        checklist: z.record(z.string(), z.boolean()).default({}),
        note: z.string().max(500).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('검토 결과를 확인해 주세요.');
    res.json(ok(await review.submitReview(currentUser(req), id, body.data, clientIp(req))));
  });

  return router;
}
