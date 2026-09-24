/**
 * 뉴스 토론방 API (9.3-1): 학생·교사 열람, 학생 투표·의견
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { toCommentView } from '../lib/serializers/comment.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import * as news from '../services/NewsService.js';
import * as reactions from '../services/ReactionService.js';

const idOf = (raw: unknown): number => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('주제 번호가 올바르지 않아요.');
  return id;
};

export function createNewsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/topics', async (req, res) => {
    const status = req.query.status === 'closed' ? 'closed' : 'live';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(ok(await news.listTopics(currentUser(req), status, cursor)));
  });

  router.get('/topics/:id', async (req, res) => {
    res.json(ok(await news.topicDetail(currentUser(req), idOf(req.params.id))));
  });

  router.get('/topics/:id/reactions', async (req, res) => {
    res.json(ok(await reactions.reactionsFor(currentUser(req), 'news_topic', idOf(req.params.id))));
  });

  router.put('/topics/:id/vote', async (req, res) => {
    const body = z.object({ side: z.enum(['agree', 'disagree']) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('찬성 또는 반대를 골라 주세요.');
    res.json(ok(await news.vote(currentUser(req), idOf(req.params.id), body.data.side)));
  });

  router.post('/topics/:id/comments', async (req, res) => {
    const user = currentUser(req);
    const body = z.object({ body: z.string().max(1000) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('의견 내용을 적어 주세요.');
    const bundle = await reactions.addComment(
      user,
      'news_topic',
      idOf(req.params.id),
      body.data.body,
    );
    res.status(201).json(ok(toCommentView(bundle, user.row.id, false)));
  });

  return router;
}
