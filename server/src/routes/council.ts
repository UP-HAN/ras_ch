/**
 * 자치회 1차 검토 API (9.4 /council/review/*). 임원 학생(council) 또는 교사 검토 계정(council_teacher).
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as review from '../services/ReviewService.js';
import * as news from '../services/NewsService.js';
import { NEWS_TAGS } from '../lib/newsRules.js';

export function createCouncilRouter(): Router {
  const router = Router();

  // 요약은 로그인만 필요(홈 카드용). 임원이 아니면 hasAssignment=false
  router.get('/review/summary', async (req, res) => {
    res.json(ok(await review.reviewSummary(currentUser(req))));
  });

  router.use(requireRole('council', 'council_teacher'));

  // 토론 주제 제안 → 주제 은행 pending (NWS-05, 임원)
  router.post('/bank-proposals', async (req, res) => {
    const body = z
      .object({
        title: z.string().max(60),
        body: z.string().max(600),
        type: z.enum(['vote', 'open']),
        questions: z.array(z.string().max(150)).max(5),
        tags: z.array(z.enum(NEWS_TAGS)).max(7),
        sourceUrl: z.string().max(300).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('제안 내용을 확인해 주세요.');
    res.status(201).json(ok(await news.propose(currentUser(req), body.data, clientIp(req))));
  });

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
