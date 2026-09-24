/**
 * 토론 주제 관리 API (/admin/news/*, 9.3-1·9.4): 승인 권한 교사(approver, admin 포함)
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { NEWS_TAGS } from '../lib/newsRules.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import { runNewsPublish, runNewsReserve } from '../jobs/newsJobs.js';
import * as admin from '../services/NewsAdminService.js';

const idOf = (raw: unknown): number => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('번호가 올바르지 않아요.');
  return id;
};

const topicBody = z.object({
  title: z.string().max(60),
  body: z.string().max(600),
  type: z.enum(['vote', 'open']),
  questions: z.array(z.string().max(150)).max(5),
  tags: z.array(z.enum(NEWS_TAGS)).max(7),
  sourceUrl: z.string().max(300).nullable().optional(),
});

export function createNewsAdminRouter(): Router {
  const router = Router();
  router.use(requireRole('approver'));

  router.get('/topics', async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    res.json(ok(await admin.listTopics(from, to)));
  });
  router.post('/topics', async (req, res) => {
    const body = topicBody.extend({ publishAt: z.string() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('주제 내용을 확인해 주세요.');
    res.status(201).json(ok(await admin.createTopic(currentUser(req), body.data, clientIp(req))));
  });
  router.patch('/topics/:id', async (req, res) => {
    const body = topicBody.extend({ publishAt: z.string().optional() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('주제 내용을 확인해 주세요.');
    res.json(
      ok(await admin.updateTopic(currentUser(req), idOf(req.params.id), body.data, clientIp(req))),
    );
  });
  router.post('/topics/:id/cancel', async (req, res) => {
    await admin.cancelTopic(currentUser(req), idOf(req.params.id), clientIp(req));
    res.json(ok({ cancelled: true }));
  });
  router.post('/topics/:id/publish-now', async (req, res) => {
    res.json(ok(await admin.publishNow(currentUser(req), idOf(req.params.id), clientIp(req))));
  });
  router.post('/topics/:id/close-now', async (req, res) => {
    res.json(ok(await admin.closeNow(currentUser(req), idOf(req.params.id), clientIp(req))));
  });

  router.get('/bank', async (_req, res) => res.json(ok(await admin.listBank())));
  router.post('/bank', async (req, res) => {
    const body = topicBody
      .extend({ status: z.enum(['ready', 'reserve']).optional() })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('주제 내용을 확인해 주세요.');
    res.status(201).json(ok(await admin.createBank(currentUser(req), body.data, clientIp(req))));
  });
  router.patch('/bank/:id', async (req, res) => {
    const body = topicBody.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('주제 내용을 확인해 주세요.');
    res.json(
      ok(await admin.updateBank(currentUser(req), idOf(req.params.id), body.data, clientIp(req))),
    );
  });
  router.post('/bank/:id/status', async (req, res) => {
    const body = z.object({ status: z.enum(['ready', 'reserve']) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('상태를 골라 주세요.');
    res.json(
      ok(
        await admin.setBankStatus(
          currentUser(req),
          idOf(req.params.id),
          body.data.status,
          clientIp(req),
        ),
      ),
    );
  });
  router.post('/bank/:id/schedule', async (req, res) => {
    const body = z.object({ publishAt: z.string() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('게시 시각을 정해 주세요.');
    res
      .status(201)
      .json(
        ok(
          await admin.scheduleFromBank(
            currentUser(req),
            idOf(req.params.id),
            body.data.publishAt,
            clientIp(req),
          ),
        ),
      );
  });
  router.delete('/bank/:id', async (req, res) => {
    await admin.deleteBank(currentUser(req), idOf(req.params.id), clientIp(req));
    res.json(ok({ deleted: true }));
  });

  router.get('/settings', async (_req, res) => res.json(ok(await admin.settingsView())));
  router.put('/settings', async (req, res) => {
    const body = z
      .object({
        perWeek: z.number().int().optional(),
        hour: z.number().int().optional(),
        durationDays: z.number().int().optional(),
        bestPerGrade: z.number().int().optional(),
        commentsPerTopic: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('설정 값을 확인해 주세요.');
    res.json(ok(await admin.updateSettings(currentUser(req), body.data, clientIp(req))));
  });

  /** 배치 수동 실행 (cron 없이 시연·점검) */
  router.post('/jobs/run', async (req, res) => {
    const body = z.object({ job: z.enum(['reserve', 'publish']) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('실행할 작업을 골라 주세요.');
    const result = body.data.job === 'reserve' ? await runNewsReserve() : await runNewsPublish();
    res.json(ok(result));
  });

  return router;
}
