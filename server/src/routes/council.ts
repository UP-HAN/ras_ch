/**
 * 자치회 1차 검토 API (9.4 /council/review/*). 임원 학생(council) 또는 교사 검토 계정(council_teacher).
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as review from '../services/ReviewService.js';
import * as news from '../services/NewsService.js';
import * as reactions from '../services/ReactionService.js';
import { toCommentView } from '../lib/serializers/comment.js';
import { NEWS_TAGS } from '../lib/newsRules.js';
import multer from 'multer';
import type { Request } from 'express';
import { MAX_IMAGE_BYTES } from '../lib/image.js';
import * as councilPosts from '../services/CouncilPostService.js';
import type { UploadedFile } from '../services/PostService.js';
import type { CouncilPostInput } from '../types/api.js';

const idOf = (raw: unknown): number => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(n) || n <= 0) throw AppError.badRequest('번호가 올바르지 않아요.');
  return n;
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 5 },
});
const photoFields = upload.fields([{ name: 'photos', maxCount: 5 }]);
const boolish = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
  z.boolean().optional(),
);
const optionsField = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string' || v.trim() === '') return [];
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 줄바꿈 구분
    }
    return v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  },
  z.array(z.string().max(60)).max(10),
);
const councilPostSchema = z.object({
  type: z.enum(['notice', 'promo', 'poll', 'report']),
  title: z.string().max(200),
  body: z.string().max(5000),
  startsAt: z.string(),
  endsAt: z.string(),
  pinRequested: boolish,
  allowComments: boolish,
  pollOptions: optionsField,
  pollShowBeforeClose: boolish,
  submit: boolish,
});
function councilInput(req: Request): CouncilPostInput {
  const body = councilPostSchema.safeParse(req.body ?? {});
  if (!body.success) throw AppError.badRequest('입력 내용을 확인해 주세요.');
  const d = body.data;
  return {
    type: d.type,
    title: d.title,
    body: d.body,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    pinRequested: d.pinRequested ?? false,
    allowComments: d.allowComments ?? true,
    pollOptions: d.pollOptions,
    pollShowBeforeClose: d.pollShowBeforeClose ?? false,
    submit: d.submit ?? false,
  };
}
function photosOf(req: Request): UploadedFile[] {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return (f.photos ?? []).map((file) => ({ buffer: file.buffer, size: file.size }));
}

export function createCouncilRouter(): Router {
  const router = Router();

  // 요약은 로그인만 필요(홈 카드용). 임원이 아니면 hasAssignment=false
  router.get('/review/summary', async (req, res) => {
    res.json(ok(await review.reviewSummary(currentUser(req))));
  });

  // ----- 자치회 게시판 열람·투표: 로그인만 필요 (CNC-01, 02) -----
  router.get('/posts', async (req, res) => {
    const scope =
      req.query.scope === 'past' ? 'past' : req.query.scope === 'drafts' ? 'drafts' : 'live';
    res.json(ok(await councilPosts.listPosts(currentUser(req), scope)));
  });
  router.get('/posts/:id', async (req, res) => {
    res.json(ok(await councilPosts.getPost(currentUser(req), idOf(req.params.id))));
  });
  // 댓글·좋아요 공통 파이프라인 (포인트 없음 CNC-06)
  router.get('/posts/:id/reactions', async (req, res) => {
    res.json(
      ok(await reactions.reactionsFor(currentUser(req), 'council_post', idOf(req.params.id))),
    );
  });
  router.post('/posts/:id/comments', async (req, res) => {
    const user = currentUser(req);
    const body = z.object({ body: z.string().max(1000) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('댓글 내용을 적어 주세요.');
    const bundle = await reactions.addComment(
      user,
      'council_post',
      idOf(req.params.id),
      body.data.body,
    );
    res.status(201).json(ok(toCommentView(bundle, user.row.id, false)));
  });
  // 좋아요 (포인트 없음 CNC-06) — /council 라우터가 먼저 매칭되므로 여기서 받는다
  router.post('/posts/:id/like', async (req, res) => {
    res.json(
      ok(await reactions.setLike(currentUser(req), 'council_post', idOf(req.params.id), true)),
    );
  });
  router.delete('/posts/:id/like', async (req, res) => {
    res.json(
      ok(await reactions.setLike(currentUser(req), 'council_post', idOf(req.params.id), false)),
    );
  });
  router.post('/posts/:id/poll-vote', async (req, res) => {
    const body = z.object({ optionId: z.number().int().positive() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('선택지를 골라 주세요.');
    res.json(
      ok(await councilPosts.pollVote(currentUser(req), idOf(req.params.id), body.data.optionId)),
    );
  });

  // ----- 임원 작성·공동 편집·제출 (CNC-01, 05) — 임원만 -----
  router.post('/posts', requireRole('council'), photoFields, async (req, res) => {
    res
      .status(201)
      .json(ok(await councilPosts.createPost(currentUser(req), councilInput(req), photosOf(req))));
  });
  router.patch('/posts/:id', requireRole('council'), photoFields, async (req, res) => {
    res.json(
      ok(
        await councilPosts.updatePost(
          currentUser(req),
          idOf(req.params.id),
          councilInput(req),
          photosOf(req),
        ),
      ),
    );
  });
  router.post('/posts/:id/submit', requireRole('council'), async (req, res) => {
    res.json(ok(await councilPosts.submitPost(currentUser(req), idOf(req.params.id))));
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
