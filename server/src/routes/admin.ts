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

  return router;
}
