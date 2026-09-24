/**
 * 자치회 관리 API (/admin/council/*, CNC-03·04·07, 임원 지정). 승인 권한 교사(approver, admin 포함)
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as admin from '../services/CouncilAdminService.js';
import { runCouncilExpire } from '../jobs/councilJobs.js';

const idOf = (raw: unknown): number => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(n) || n <= 0) throw AppError.badRequest('번호가 올바르지 않아요.');
  return n;
};

export function createCouncilAdminRouter(): Router {
  const router = Router();
  router.use(requireRole('approver'));

  // 임원
  router.get('/members', async (_req, res) => res.json(ok(await admin.listMembers())));
  router.post('/members', async (req, res) => {
    const body = z
      .object({
        userId: z.number().int().positive(),
        title: z.string().max(20),
        termStart: z.string(),
        termEnd: z.string().nullable().default(null),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('임원 정보를 확인해 주세요.');
    res.status(201).json(ok(await admin.addMember(currentUser(req), body.data, clientIp(req))));
  });
  router.delete('/members/:id', async (req, res) => {
    await admin.removeMember(currentUser(req), idOf(req.params.id), clientIp(req));
    res.json(ok({ removed: true }));
  });

  // 글
  router.get('/posts', async (req, res) => {
    const scope =
      req.query.scope === 'approved' || req.query.scope === 'all' ? req.query.scope : 'pending';
    res.json(ok(await admin.listForAdmin(currentUser(req), scope)));
  });
  router.post('/posts/:id/approve', async (req, res) => {
    const body = z
      .object({
        isPinned: z.boolean().default(false),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) throw AppError.badRequest('승인 내용을 확인해 주세요.');
    res.json(
      ok(await admin.approve(currentUser(req), idOf(req.params.id), body.data, clientIp(req))),
    );
  });
  router.post('/posts/:id/reject', async (req, res) => {
    const body = z.object({ reason: z.string().max(200) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('반려 이유를 적어 주세요.');
    res.json(
      ok(
        await admin.reject(currentUser(req), idOf(req.params.id), body.data.reason, clientIp(req)),
      ),
    );
  });
  router.post('/posts/:id/pin', async (req, res) => {
    const body = z.object({ isPinned: z.boolean() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('고정 여부를 확인해 주세요.');
    res.json(
      ok(
        await admin.setPinned(
          currentUser(req),
          idOf(req.params.id),
          body.data.isPinned,
          clientIp(req),
        ),
      ),
    );
  });
  router.post('/posts/:id/hide', async (req, res) => {
    res.json(ok(await admin.setHidden(currentUser(req), idOf(req.params.id), true, clientIp(req))));
  });
  router.post('/posts/:id/unhide', async (req, res) => {
    res.json(
      ok(await admin.setHidden(currentUser(req), idOf(req.params.id), false, clientIp(req))),
    );
  });

  // 만료 배치 지금 실행 (CNC-07)
  router.post('/jobs/expire', async (_req, res) => {
    res.json(ok({ expired: await runCouncilExpire() }));
  });

  return router;
}
