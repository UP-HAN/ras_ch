/**
 * 게시글 API (9.2) — S2: 리포트·일기. 기사는 S3에서 같은 라우터에 추가.
 *  - 학생 응답은 toStudentPostView / 본인 글은 toMyPostView (실명 없음, 3.1)
 *  - 교사가 상세를 보면 toTeacherPostView
 */
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { ARTICLE_LIMITS } from '../lib/articleRules.js';
import { MAX_IMAGE_BYTES } from '../lib/image.js';
import { toCommentView } from '../lib/serializers/comment.js';
import * as reactions from '../services/ReactionService.js';
import { isTeacherLike, viewerFromAuthUser } from '../lib/postAccess.js';
import {
  allowedWeekKeys,
  defaultWeekKey,
  REPORT_LIMITS,
  TOP_CATEGORIES,
} from '../lib/reportRules.js';
import { toMyPostView, toStudentPostView, toTeacherPostView } from '../lib/serializers/post.js';
import { previousWeekKey } from '../lib/time.js';
import { clientIp, currentUser, requireAuth } from '../middleware/auth.js';
import * as postRepo from '../repos/postRepo.js';
import * as posts from '../services/PostService.js';
import type { PostListPage, StudentPostView, WeekContextView } from '../types/api.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 3 },
});
const captureFields = upload.fields([
  { name: 'category_capture', maxCount: 1 },
  { name: 'app_capture', maxCount: 1 },
]);
const photoFields = upload.fields([{ name: 'photos', maxCount: ARTICLE_LIMITS.photosMax }]);

const articleSchema = z.object({
  title: z.string(),
  articleType: z.string(),
  tags: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v
        : typeof v === 'string'
          ? v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
    z.array(z.string()),
  ),
  body: z.string(),
  oneLine: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? null : v),
    z.string().nullable(),
  ),
  submit: z.preprocess(
    (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
    z.boolean().optional(),
  ),
});

function photosOf(req: Request): posts.UploadedFile[] {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return (f.photos ?? []).map((file) => ({ buffer: file.buffer, size: file.size }));
}

const charLen = (s: string) => Array.from(s).length;
const optionalStr = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : v),
  z.string().optional(),
);
const optionalNum = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
  z.number().int().min(0).max(REPORT_LIMITS.avgMax).optional(),
);
const boolish = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
  z.boolean().optional(),
);

const baseSchema = z.object({
  visibility: z.enum(['class', 'school']).default('class'),
  avgMinutes: optionalNum,
  topCategory: z.preprocess((v) => (v === '' ? undefined : v), z.enum(TOP_CATEGORIES).optional()),
  topApp: optionalStr,
  body: z.string(),
  goalText: z.string(),
  goalAchieved: boolish,
  goalReason: optionalStr,
  submit: boolish.default(true),
});

const createSchema = baseSchema.extend({
  type: z.enum(['report', 'diary']),
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
});

type Parsed = z.infer<typeof baseSchema>;

function validateText(p: Parsed, type: 'report' | 'diary'): void {
  const bodyLen = charLen(p.body.trim());
  if (bodyLen < REPORT_LIMITS.bodyMin || bodyLen > REPORT_LIMITS.bodyMax) {
    throw AppError.badRequest(
      `성찰 글은 ${REPORT_LIMITS.bodyMin}~${REPORT_LIMITS.bodyMax}자로 써 주세요. (지금 ${bodyLen}자)`,
    );
  }
  const goalLen = charLen(p.goalText.trim());
  if (goalLen < REPORT_LIMITS.goalMin || goalLen > REPORT_LIMITS.goalMax) {
    throw AppError.badRequest(
      `다음 주 목표를 ${REPORT_LIMITS.goalMax}자 안에서 한 줄 적어 주세요.`,
    );
  }
  if (p.topApp && charLen(p.topApp) > REPORT_LIMITS.topAppMax)
    throw AppError.badRequest('앱 이름은 50자까지만요.');
  if (p.goalReason && charLen(p.goalReason) > REPORT_LIMITS.goalReasonMax)
    throw AppError.badRequest('이유는 200자까지만요.');
  if (type === 'report') {
    if (p.avgMinutes === undefined) throw AppError.badRequest('하루 평균 사용시간을 적어 주세요.');
    if (!p.topCategory) throw AppError.badRequest('가장 많이 쓴 카테고리를 골라 주세요.');
    if (!p.topApp) throw AppError.badRequest('가장 많이 쓴 앱 이름을 적어 주세요.');
  }
}

function toInput(p: Parsed): posts.ReportUpdate {
  return {
    visibility: p.visibility,
    avgMinutes: p.avgMinutes ?? null,
    topCategory: p.topCategory ?? null,
    topApp: p.topApp?.trim() ?? null,
    body: p.body.trim(),
    goalText: p.goalText.trim(),
    goalAchieved: p.goalAchieved ?? null,
    goalReason: p.goalReason?.trim() ?? null,
    submit: p.submit ?? true,
  };
}

function filesOf(req: Request): posts.CaptureFiles {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  const pick = (name: string) => {
    const file = f[name]?.[0];
    return file ? { buffer: file.buffer, size: file.size } : undefined;
  };
  const out: posts.CaptureFiles = {};
  const c = pick('category_capture');
  const a = pick('app_capture');
  if (c) out.category_capture = c;
  if (a) out.app_capture = a;
  return out;
}

function encodeCursor(
  sort: 'latest' | 'likes',
  post: { approved_at: Date | null; like_count: number; id: number },
): string {
  const key =
    sort === 'likes'
      ? `L|${post.like_count}|${post.id}`
      : `T|${post.approved_at?.toISOString() ?? ''}|${post.id}`;
  return Buffer.from(key, 'utf8').toString('base64url');
}
function decodeCursor(
  raw: unknown,
): { approvedAt?: string; likeCount?: number; id: number } | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const [kind, value, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (!kind || value === undefined || !id)
    throw AppError.badRequest('목록 위치가 올바르지 않아요.');
  if (kind === 'L') return { likeCount: Number(value), id: Number(id) };
  if (Number.isNaN(Date.parse(value))) throw AppError.badRequest('목록 위치가 올바르지 않아요.');
  // DB 는 KST 벽시계 DATETIME → ISO 를 KST 문자열로
  const d = new Date(value);
  const kstStr = new Date(d.getTime() + 9 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
  return { approvedAt: kstStr, id: Number(id) };
}

export function createPostsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // 작성 화면 맥락 (RPT-01, 03, AUTH-08)
  router.get('/week-context', async (req, res) => {
    const user = currentUser(req);
    if (user.row.role !== 'student') throw AppError.forbidden('학생만 리포트를 써요.');
    const { current, previous } = allowedWeekKeys();
    const existing: WeekContextView['existing'] = {};
    for (const wk of [current, previous]) {
      const p = await postRepo.findReportByAuthorWeek(user.row.id, wk);
      existing[wk] = p && !p.deleted_at ? { postId: p.id, status: p.status } : null;
    }
    const target = defaultWeekKey();
    const prev = await postRepo.findPrevWeekReport(user.row.id, previousWeekKey(target));
    const data: WeekContextView = {
      currentWeekKey: current,
      previousWeekKey: previous,
      defaultWeekKey: target,
      existing,
      canUseCapture: user.row.parent_consent === 'Y',
      prevGoalText: prev?.goal_text ?? null,
      prevAvgMinutes: prev?.avg_minutes_per_day ?? null,
      topCategories: [...TOP_CATEGORIES],
      limits: {
        bodyMin: REPORT_LIMITS.bodyMin,
        bodyMax: REPORT_LIMITS.bodyMax,
        goalMax: REPORT_LIMITS.goalMax,
        goalReasonMax: REPORT_LIMITS.goalReasonMax,
        topAppMax: REPORT_LIMITS.topAppMax,
      },
    };
    res.json(ok(data));
  });

  // 내 리포트 목록
  router.get('/mine', async (req, res) => {
    const user = currentUser(req);
    const bundles = await postRepo.listByAuthor(user.row.id, ['report', 'diary']);
    res.json(ok(bundles.map((b) => toMyPostView(b, user.row.id))));
  });

  // 목록 (RPT-07): scope=class 같은 반, scope=school 전교 공개. 승인된 글만
  router.get('/', async (req, res) => {
    const user = currentUser(req);
    const scope = req.query.scope === 'school' ? 'school' : 'class';
    const type = req.query.type === 'article' ? 'article' : 'report';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const types = type === 'article' ? (['article'] as const) : (['report', 'diary'] as const);
    let classId: number | undefined;
    if (scope === 'class') {
      const q = Number(req.query.class_id);
      if (user.row.role === 'student') classId = user.row.class_id ?? undefined;
      else if (Number.isInteger(q) && q > 0) classId = q;
      if (classId === undefined) throw AppError.badRequest('반을 알 수 없어요.');
    }
    const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
    const tag = typeof req.query.tag === 'string' && req.query.tag ? req.query.tag : undefined;
    const bundles = await postRepo.listApproved({
      type: [...types],
      classId,
      schoolOnly: scope === 'school',
      sort,
      tag,
      reporterOnly: req.query.reporter === '1',
      cursor: decodeCursor(req.query.cursor),
      limit: limit + 1,
    });
    const page = bundles.slice(0, limit);
    const last = page[page.length - 1];
    const data: PostListPage<StudentPostView> = {
      items: page.map((b) => toStudentPostView(b, user.row.id)),
      nextCursor: bundles.length > limit && last ? encodeCursor(sort, last.post) : null,
    };
    res.json(ok(data));
  });

  // ---------- 기사 (ART-01~03, 07) ----------
  router.post('/articles', photoFields, async (req, res) => {
    const user = currentUser(req);
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success)
      throw AppError.badRequest('입력 내용을 다시 확인해 주세요.', parsed.error.issues);
    const bundle = await posts.createArticle(
      user,
      { ...parsed.data, submit: parsed.data.submit ?? true },
      photosOf(req),
    );
    res.status(201).json(ok(toMyPostView(bundle, user.row.id)));
  });

  router.patch('/articles/:id', photoFields, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success)
      throw AppError.badRequest('입력 내용을 다시 확인해 주세요.', parsed.error.issues);
    const bundle = await posts.updateArticle(
      user,
      id,
      { ...parsed.data, submit: parsed.data.submit ?? true },
      photosOf(req),
    );
    res.json(ok(toMyPostView(bundle, user.row.id)));
  });

  // ---------- 반응 (RCT-01, 02, 06) ----------
  router.get('/:id/reactions', async (req, res) => {
    const user = currentUser(req);
    res.json(ok(await reactions.reactionsFor(user, Number(req.params.id))));
  });

  router.post('/:id/like', async (req, res) => {
    res.json(ok(await reactions.setLike(currentUser(req), 'post', Number(req.params.id), true)));
  });

  router.delete('/:id/like', async (req, res) => {
    res.json(ok(await reactions.setLike(currentUser(req), 'post', Number(req.params.id), false)));
  });

  router.get('/:id/comments', async (req, res) => {
    const user = currentUser(req);
    const r = await reactions.reactionsFor(user, Number(req.params.id));
    res.json(ok(r.comments));
  });

  router.post('/:id/comments', async (req, res) => {
    const user = currentUser(req);
    const body = z.object({ body: z.string().max(1000) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('댓글 내용을 적어 주세요.');
    const bundle = await reactions.addComment(user, Number(req.params.id), body.data.body);
    res.status(201).json(ok(toCommentView(bundle, user.row.id, false)));
  });

  // 작성 (RPT-01, 02, 09): multipart (category_capture, app_capture + 필드)
  router.post('/', captureFields, async (req, res) => {
    const user = currentUser(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      throw AppError.badRequest('입력 내용을 다시 확인해 주세요.', parsed.error.issues);
    validateText(parsed.data, parsed.data.type);
    const bundle = await posts.createReport(
      user,
      { ...toInput(parsed.data), type: parsed.data.type, weekKey: parsed.data.weekKey },
      filesOf(req),
    );
    res.status(201).json(ok(toMyPostView(bundle, user.row.id)));
  });

  router.get('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    const bundle = await posts.getVisibleBundle(user, id);
    if (isTeacherLike(viewerFromAuthUser(user))) return res.json(ok(toTeacherPostView(bundle)));
    if (bundle.post.author_id === user.row.id)
      return res.json(ok(toMyPostView(bundle, user.row.id)));
    res.json(ok(toStudentPostView(bundle, user.row.id)));
  });

  // 승인 전 본인 수정 (RPT-06)
  router.patch('/:id', captureFields, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    const post = await postRepo.findPostById(id);
    if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success)
      throw AppError.badRequest('입력 내용을 다시 확인해 주세요.', parsed.error.issues);
    if (post.type === 'article')
      throw AppError.badRequest('기사는 /posts/articles/:id 로 고쳐 주세요.');
    validateText(parsed.data, post.type === 'diary' ? 'diary' : 'report');
    const bundle = await posts.updateReport(user, id, toInput(parsed.data), filesOf(req));
    res.json(ok(toMyPostView(bundle, user.row.id)));
  });

  // 삭제: 작성자 또는 담당 교사 (포인트 회수는 PointService.reverse)
  router.delete('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw AppError.badRequest('글 번호가 올바르지 않아요.');
    await posts.transition(id, 'delete', user, { ip: clientIp(req) });
    res.json(ok({ deleted: true }));
  });

  return router;
}
