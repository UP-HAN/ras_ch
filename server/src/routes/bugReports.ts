/**
 * 버그 신고 — 신고자용 API (BUG-01, BUG-02). 로그인한 학생·교사 누구나.
 *  POST /bug-reports          신고 작성 (multipart, 캡처 photo 1장은 선택)
 *  GET  /bug-reports/mine     내가 보낸 신고 + 오늘 남은 횟수
 *  GET  /bug-reports/:id      신고 1건 (본인 또는 관리자만)
 *
 * 관리자용(전체 목록·상태·답변)은 routes/admin.ts 의 /admin/bug-reports 에 있다.
 */
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { BUG_LIMITS } from '../lib/bugReportRules.js';
import { MAX_IMAGE_BYTES } from '../lib/image.js';
import { clientIp, currentUser, requireAuth } from '../middleware/auth.js';
import * as bugs from '../services/BugReportService.js';
import type { UploadedFile } from '../services/PostService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});
const photoField = upload.fields([{ name: 'photo', maxCount: 1 }]);

const bugSchema = z.object({
  title: z.string().max(BUG_LIMITS.titleMax * 2),
  body: z.string().max(BUG_LIMITS.bodyMax * 2),
  pagePath: z.string().max(500).optional(),
});

function firstFile(req: Request): UploadedFile | null {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return f.photo?.[0] ?? null;
}

export function createBugReportsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // BUG-01
  router.post('/', photoField, async (req, res) => {
    const body = bugSchema.safeParse(req.body ?? {});
    if (!body.success) throw AppError.badRequest('입력 내용을 확인해 주세요.');
    const view = await bugs.createReport(
      currentUser(req),
      {
        title: body.data.title,
        body: body.data.body,
        pagePath: body.data.pagePath ?? null,
      },
      firstFile(req),
      clientIp(req),
    );
    res.status(201).json(ok(view));
  });

  // BUG-02
  router.get('/mine', async (req, res) => {
    res.json(ok(await bugs.myReports(currentUser(req))));
  });

  router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('신고 번호가 올바르지 않아요.');
    res.json(ok(await bugs.getReport(currentUser(req), id)));
  });

  return router;
}
