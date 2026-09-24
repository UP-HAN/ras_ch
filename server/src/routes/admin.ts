/**
 * 관리자 API (ADM-01, AUTH-03, AUTH-05, 9.4). 전부 requireRole('admin').
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { decodeCsvBuffer } from '../lib/csv.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../repos/auditRepo.js';
import { insertBannedWord, listBannedWords, setBannedWordActive } from '../repos/bannedWordRepo.js';
import type { BannedWordView } from '../types/api.js';
import { getSetting } from '../repos/settingsRepo.js';
import * as admin from '../services/AdminService.js';
import { deleteClassStudents, deleteUser } from '../services/UserAdminService.js';
import * as settings from '../services/AdminSettingsService.js';
import { gamifySettingsView, updateGamifySettings } from '../services/GamifyService.js';
import { rebuildPoints } from '../services/PointsQueryService.js';
import { runRecountCaches } from '../jobs/recountCaches.js';
import * as notices from '../services/NoticeService.js';
import { schoolStats } from '../services/StatsService.js';
import { importStudents, parseStudentCsv } from '../services/StudentImportService.js';
import type { ImportResult } from '../types/api.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

const idParam = (raw: unknown): number => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(n) || n <= 0) throw AppError.badRequest('번호가 올바르지 않아요.');
  return n;
};

const gradeGroup = z.enum(['3-4', '5-6']).nullable();

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireRole('admin'));
  const actor = (req: Parameters<typeof currentUser>[0]) => ({
    id: currentUser(req).row.id,
    ip: clientIp(req),
  });

  // ----- 학년도 -----
  router.get('/school-years', async (_req, res) => res.json(ok(await admin.listSchoolYears())));

  router.post('/school-years', async (req, res) => {
    const body = z
      .object({
        year: z.number().int().min(2020).max(2100),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        makeCurrent: z.boolean().default(false),
      })
      .safeParse(req.body);
    if (!body.success)
      throw AppError.badRequest('학년도 입력값을 확인해 주세요.', body.error.issues);
    res.status(201).json(ok({ id: await admin.createSchoolYear(actor(req), body.data) }));
  });

  router.put('/school-years/:id/current', async (req, res) => {
    await admin.setCurrentSchoolYear(actor(req), idParam(req.params.id));
    res.json(ok({ updated: true }));
  });

  // ----- 반 -----
  router.get('/classes', async (req, res) => {
    const yearId = req.query.school_year_id ? idParam(req.query.school_year_id) : undefined;
    res.json(ok(await admin.listClasses(yearId)));
  });

  router.post('/classes', async (req, res) => {
    const allowed = await getSetting<number[]>('allowed_grades', [3, 4, 5, 6]);
    const body = z
      .object({
        grade: z
          .number()
          .int()
          .refine((g) => allowed.includes(g)),
        classNo: z.number().int().min(1).max(30),
      })
      .safeParse(req.body);
    if (!body.success)
      throw AppError.badRequest(`학년은 ${allowed.join('·')}, 반은 1~30이어야 해요.`);
    res.status(201).json(ok({ id: await admin.createClass(actor(req), body.data) }));
  });

  router.put('/classes/:id/homeroom', async (req, res) => {
    const body = z
      .object({ teacherId: z.number().int().positive().nullable() })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('교사 번호를 확인해 주세요.');
    await admin.setHomeroom(actor(req), idParam(req.params.id), body.data.teacherId);
    res.json(ok({ updated: true }));
  });

  router.put('/classes/:id/teachers', async (req, res) => {
    const body = z
      .object({ teacherIds: z.array(z.number().int().positive()).max(20) })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('교사 목록을 확인해 주세요.');
    await admin.setClassTeachers(actor(req), idParam(req.params.id), body.data.teacherIds);
    res.json(ok({ updated: true }));
  });

  // ----- 교사 -----
  router.get('/teachers', async (_req, res) => res.json(ok(await admin.listTeachers())));

  router.post('/teachers', async (req, res) => {
    const body = z
      .object({
        loginId: z.string().min(3).max(64),
        name: z.string().min(2).max(30),
        password: z.string().min(8).max(64).optional(),
        isApprover: z.boolean().default(false),
        advisorGradeGroup: gradeGroup.default(null),
        role: z.enum(['teacher', 'admin']).default('teacher'),
      })
      .safeParse(req.body);
    if (!body.success)
      throw AppError.badRequest(
        '교사 정보를 확인해 주세요. (이메일 ID, 이름 2자 이상, 비밀번호 8자 이상)',
      );
    res.status(201).json(ok(await admin.createTeacher(actor(req), body.data)));
  });

  router.put('/teachers/:id/roles', async (req, res) => {
    const body = z
      .object({ isApprover: z.boolean(), advisorGradeGroup: gradeGroup })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('역할 값을 확인해 주세요.');
    await admin.setTeacherRoles(actor(req), idParam(req.params.id), body.data);
    res.json(ok({ updated: true }));
  });

  // ----- 학생 -----
  router.get('/students', async (req, res) => {
    res.json(ok(await admin.listStudents(idParam(req.query.class_id))));
  });

  // AUTH-03 CSV 일괄 등록. multipart 'file' 또는 JSON { csv }. ?dry_run=1 이면 검증·미리보기만
  router.post('/students/import', upload.single('file'), async (req, res) => {
    const text = req.file
      ? decodeCsvBuffer(req.file.buffer)
      : typeof (req.body as { csv?: unknown })?.csv === 'string'
        ? ((req.body as { csv: string }).csv as string)
        : null;
    if (!text)
      throw AppError.badRequest(
        'CSV 파일을 올려 주세요. (열: 학년,반,번호,이름,초기비밀번호,학부모동의,기자단)',
      );
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    const allowed = await getSetting<number[]>('allowed_grades', [3, 4, 5, 6]);
    const parsed = parseStudentCsv(text, allowed);
    if (parsed.errors.length > 0) {
      const data: ImportResult = {
        dryRun,
        created: 0,
        updated: 0,
        createdClasses: [],
        rows: [],
        errors: parsed.errors,
      };
      res.status(422).json({
        ok: false,
        error: {
          code: 'CSV_INVALID',
          message: `${parsed.errors.length}개 줄에 문제가 있어요. 고친 뒤 다시 올려 주세요.`,
          details: data,
        },
      });
      return;
    }
    const a = actor(req);
    res.json(ok(await importStudents(parsed.rows, { dryRun, actorId: a.id, ip: a.ip })));
  });

  router.patch('/students/:id', async (req, res) => {
    const body = z
      .object({
        parentConsent: z.enum(['Y', 'N']).optional(),
        isReporter: z.boolean().optional(),
        status: z.enum(['active', 'transferred', 'graduated', 'disabled']).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('수정 값을 확인해 주세요.');
    await admin.updateStudent(actor(req), idParam(req.params.id), body.data);
    res.json(ok({ updated: true }));
  });

  // ----- 계정 삭제 (시범 명단 정리): 활동 없는 계정만, 나머지는 상태 변경 -----
  router.delete('/users/:id', async (req, res) => {
    await deleteUser(actor(req), idParam(req.params.id));
    res.json(ok({ deleted: true }));
  });
  router.delete('/classes/:id/students', async (req, res) => {
    res.json(ok(await deleteClassStudents(actor(req), idParam(req.params.id))));
  });

  // ----- 금칙어 (RCT-04, ADM-02) -----
  router.get('/banned-words', async (_req, res) => {
    const rows = await listBannedWords();
    const data: BannedWordView[] = rows.map((r) => ({
      id: r.id,
      word: r.word,
      isActive: r.is_active === 1,
    }));
    res.json(ok(data));
  });

  router.post('/banned-words', async (req, res) => {
    const body = z.object({ word: z.string().trim().min(1).max(50) }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('금칙어를 1~50자로 적어 주세요.');
    const id = await insertBannedWord(body.data.word);
    const a = actor(req);
    await writeAudit({
      actorId: a.id,
      action: 'banned_word.add',
      targetType: 'banned_word',
      targetId: id,
      ip: a.ip,
    });
    res.status(201).json(ok({ id }));
  });

  router.patch('/banned-words/:id', async (req, res) => {
    const body = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!body.success) throw AppError.badRequest('값을 확인해 주세요.');
    const id = idParam(req.params.id);
    await setBannedWordActive(id, body.data.isActive);
    const a = actor(req);
    await writeAudit({
      actorId: a.id,
      action: 'banned_word.set_active',
      targetType: 'banned_word',
      targetId: id,
      payload: body.data,
      ip: a.ip,
    });
    res.json(ok({ updated: true }));
  });

  // ----- S4: 규칙표 (PT-05) -----
  router.get('/point-rules', async (_req, res) => res.json(ok(await settings.listPointRules())));

  router.put('/point-rules/:code', async (req, res) => {
    const body = z
      .object({
        amount: z.number().int(),
        amountMin: z.number().int().nullable(),
        amountMax: z.number().int().nullable(),
        caps: z.array(z.unknown()),
        isActive: z.boolean(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('규칙 값을 확인해 주세요.');
    const code = String(req.params.code);
    res.json(
      ok(
        await settings.updatePointRule(actor(req), code, {
          ...body.data,
          caps: settings.validateCaps(body.data.caps),
        }),
      ),
    );
  });

  // ----- P2-3: 게이미피케이션 설정 (PT-07 등급 구간, 주간 선물 N, 학급 미션 목표) -----
  router.get('/gamify-settings', async (_req, res) => res.json(ok(await gamifySettingsView())));
  router.put('/gamify-settings', async (req, res) => {
    const body = z
      .object({
        tierThresholds: z.object({
          sprout: z.number().int(),
          flower: z.number().int(),
          fruit: z.number().int(),
          star: z.number().int(),
        }),
        weeklyGiftPerGrade: z.number().int(),
        classMissionReportRate: z.number().int(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('설정 값을 확인해 주세요.');
    res.json(ok(await updateGamifySettings(currentUser(req), body.data, clientIp(req))));
  });

  // ----- S4: 승인 모드 (APR-01, 07, 14) -----
  router.get('/approval-settings', async (_req, res) =>
    res.json(ok(await settings.listApprovalSettings())),
  );

  router.put('/approval-settings', async (req, res) => {
    const body = z
      .object({
        scope: z.enum(['school', 'grade', 'class']),
        scopeId: z.number().int().nullable(),
        mode: z.enum(['two_step', 'teacher_only']),
        autoEscalateHours: z.number().int(),
        autoApproveTeacherReview: z.boolean(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('승인 설정 값을 확인해 주세요.');
    await settings.saveApprovalSetting(actor(req), body.data);
    res.json(ok({ saved: true }));
  });

  router.delete('/approval-settings/:scope/:scopeId', async (req, res) => {
    const scope = req.params.scope;
    if (scope !== 'grade' && scope !== 'class')
      throw AppError.badRequest('학년·반 설정만 지울 수 있어요.');
    await settings.removeApprovalSetting(actor(req), scope, idParam(req.params.scopeId));
    res.json(ok({ deleted: true }));
  });

  // ----- S4: 검토 담당 (APR-02, 02a) -----
  const assignmentBody = z.object({
    grades: z.array(z.number().int()).min(1),
    postTypes: z.array(z.string()).min(1),
    allowedResults: z.enum(['pass_only', 'pass_hold']),
    dailyCap: z.number().int(),
    preset: z.enum(['assist', 'basic', 'senior', 'custom']),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    isActive: z.boolean(),
  });

  router.get('/review-assignments', async (_req, res) =>
    res.json(ok(await settings.listReviewAssignments())),
  );
  router.get('/review-assignments/candidates', async (_req, res) =>
    res.json(ok(await settings.listReviewerCandidates())),
  );

  router.post('/review-assignments', async (req, res) => {
    const body = assignmentBody
      .extend({ reviewerUserId: z.number().int().positive() })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('검토 담당 값을 확인해 주세요.');
    const { reviewerUserId, ...rest } = body.data;
    const id = await settings.createReviewAssignment(actor(req), reviewerUserId, rest);
    res.status(201).json(ok({ id }));
  });

  router.put('/review-assignments/:id', async (req, res) => {
    const body = assignmentBody.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('검토 담당 값을 확인해 주세요.');
    await settings.updateReviewAssignment(actor(req), idParam(req.params.id), body.data);
    res.json(ok({ updated: true }));
  });

  router.delete('/review-assignments/:id', async (req, res) => {
    await settings.deactivateReviewAssignment(actor(req), idParam(req.params.id));
    res.json(ok({ deactivated: true }));
  });

  // ----- S4: 교사 검토 계정 (APR-12) — 비밀번호는 1회만 보여준다 -----
  router.post('/teachers/:id/council-account', async (req, res) => {
    res
      .status(201)
      .json(ok(await settings.createCouncilAccount(actor(req), idParam(req.params.id))));
  });

  // ----- S5: 전교 통계 (ADM-05) -----
  router.get('/stats', async (_req, res) => res.json(ok(await schoolStats())));

  // ----- S5: 공지 (ADM-04) -----
  const noticeBody = z.object({
    title: z.string().max(100),
    body: z.string().max(2000),
    startsAt: z.string(),
    endsAt: z.string(),
    isActive: z.boolean().default(true),
  });
  router.get('/notices', async (_req, res) => res.json(ok(await notices.listNotices())));
  router.post('/notices', async (req, res) => {
    const body = noticeBody.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('공지 내용을 확인해 주세요.');
    res.status(201).json(ok({ id: await notices.createNotice(actor(req), body.data) }));
  });
  router.put('/notices/:id', async (req, res) => {
    const body = noticeBody.safeParse(req.body);
    if (!body.success) throw AppError.badRequest('공지 내용을 확인해 주세요.');
    await notices.updateNotice(actor(req), idParam(req.params.id), body.data);
    res.json(ok({ updated: true }));
  });
  router.delete('/notices/:id', async (req, res) => {
    await notices.deleteNotice(actor(req), idParam(req.params.id));
    res.json(ok({ deleted: true }));
  });

  // ----- S5: 안내 문구 (ADM-07) -----
  router.get('/texts', async (_req, res) => res.json(ok(await notices.getTexts())));
  router.put('/texts', async (req, res) => {
    const body = z
      .object({
        captureGuide: z.object({
          android_samsung: z.string(),
          iphone: z.string(),
          warning: z.string(),
        }),
        goodCommentGuide: z.string(),
        reviewGuide: z.string(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('문구를 확인해 주세요.');
    res.json(ok(await notices.updateTexts(actor(req), body.data)));
  });

  // ----- 카운트 재검증·등급·업적 재계산 지금 실행 (8.1, PT-07) -----
  router.post('/jobs/recount-caches', async (_req, res) => {
    res.json(ok(await runRecountCaches()));
  });

  // ----- S4: 포인트 리빌드 (PT-08) -----
  router.post('/points/rebuild', async (req, res) => {
    const body = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('기간을 YYYY-MM-DD 로 적어 주세요.');
    if (body.data.from > body.data.to) throw AppError.badRequest('시작일이 종료일보다 늦어요.');
    res.json(
      ok(await rebuildPoints(currentUser(req), body.data.from, body.data.to, clientIp(req))),
    );
  });

  return router;
}
