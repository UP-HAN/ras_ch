/**
 * 댓글·신고 라우트 (RCT-01~06): /comments/:id, /comments/:id/like, /reports
 * 게시글 쪽(/posts/:id/like, /posts/:id/comments)은 routes/posts.ts 에 있다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { clientIp, currentUser, requireAuth } from '../middleware/auth.js';
import * as reactions from '../services/ReactionService.js';

const idOf = (raw: unknown): number => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('번호가 올바르지 않아요.');
  return id;
};

export function createReactionsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.delete('/comments/:id', async (req, res) => {
    await reactions.deleteComment(currentUser(req), idOf(req.params.id));
    res.json(ok({ deleted: true }));
  });

  router.post('/comments/:id/like', async (req, res) => {
    res.json(ok(await reactions.setLike(currentUser(req), 'comment', idOf(req.params.id), true)));
  });

  router.delete('/comments/:id/like', async (req, res) => {
    res.json(ok(await reactions.setLike(currentUser(req), 'comment', idOf(req.params.id), false)));
  });

  // RCT-05 신고: 1인 1회, 3회 누적 시 자동 숨김
  router.post('/reports', async (req, res) => {
    const body = z
      .object({
        targetType: z.enum(['post', 'comment']),
        targetId: z.number().int().positive(),
        reason: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('신고할 대상과 이유를 적어 주세요.');
    const user = currentUser(req);
    res
      .status(201)
      .json(
        ok(
          await reactions.report(
            user,
            body.data.targetType,
            body.data.targetId,
            body.data.reason,
            clientIp(req),
          ),
        ),
      );
  });

  return router;
}
