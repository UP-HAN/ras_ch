/**
 * 월간 결산 API (9.4 /admin/settlements, ADM-03). 승인 권한 교사(approver, admin 포함)
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError, ok } from '../lib/apiResponse.js';
import { sendCsv, type CsvCell } from '../lib/csvWrite.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import * as settlementRepo from '../repos/settlementRepo.js';
import { CATEGORY_LABEL } from '../services/settlement/awards.js';
import { confirmSettlement } from '../services/settlement/confirm.js';
import { createDraft, ensureDraft } from '../services/settlement/draft.js';
import { settlementView } from '../services/settlement/views.js';

const monthParam = (raw: unknown): string => {
  const m = String(Array.isArray(raw) ? raw[0] : raw);
  if (!/^\d{4}-\d{2}$/.test(m)) throw AppError.badRequest('월 형식은 YYYY-MM 이에요.');
  return m;
};

export function createSettlementsRouter(): Router {
  const router = Router();
  router.use(requireRole('approver'));

  router.get('/:month', async (req, res) => {
    const month = monthParam(req.params.month);
    const row = await ensureDraft(month);
    res.json(ok(await settlementView(month, row)));
  });

  router.post('/:month/draft', async (req, res) => {
    const month = monthParam(req.params.month);
    const body = z.object({ excludeWeeklyGift: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!body.success) throw AppError.badRequest('옵션을 확인해 주세요.');
    await createDraft(month, { excludeWeeklyGift: body.data.excludeWeeklyGift });
    res.json(ok(await settlementView(month, await settlementRepo.findByMonth(month))));
  });

  router.post('/:month/confirm', async (req, res) => {
    const month = monthParam(req.params.month);
    const body = z
      .object({
        perGradeGiftCount: z.number().int(),
        perGradeGrowthCount: z.number().int(),
        allowConsecutiveUserIds: z.array(z.number().int()).default([]),
        allowConsecutiveClass: z.boolean().default(false),
        excludeWeeklyGift: z.boolean().default(false),
        awards: z
          .array(
            z.object({
              category: z.enum(['phonefree', 'reporter', 'participation']),
              userId: z.number().int(),
              reason: z.string().max(200),
            }),
          )
          .default([]),
        note: z.string().max(500).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw AppError.badRequest('확정 내용을 확인해 주세요.');
    res.json(ok(await confirmSettlement(currentUser(req), month, body.data, clientIp(req))));
  });

  /** 선물 명단 CSV (반별 정렬·실명): 포인트 상위 + 성장률 + 3부문 선정 */
  router.get('/:month/gift-list.csv', async (req, res) => {
    const month = monthParam(req.params.month);
    const row = await settlementRepo.findByMonth(month);
    if (!row) throw AppError.notFound('결산이 없어요.');
    const scores = await settlementRepo.listScores(row.id);
    const awards = (await settlementRepo.listAwards(month)).filter((a) => a.status === 'selected');
    const rows: CsvCell[][] = [['반', '번호', '이름', '구분', '이번 달 포인트', '비고']];
    const lines: Array<{ cls: string; no: number; cells: CsvCell[] }> = [];
    for (const s of scores) {
      if (s.is_gift_target === 1)
        lines.push({
          cls: s.class_name,
          no: s.student_no ?? 0,
          cells: [
            s.class_name,
            s.student_no,
            s.name,
            '포인트 상위',
            s.points,
            `${s.grade}학년 ${s.rank_in_grade}위`,
          ],
        });
      if (s.is_growth_target === 1)
        lines.push({
          cls: s.class_name,
          no: s.student_no ?? 0,
          cells: [
            s.class_name,
            s.student_no,
            s.name,
            '성장률 부문',
            s.points,
            `지난달 ${s.prev_points ?? 0}P → +${Math.round(Number(s.growth_rate ?? 0) * 100)}%`,
          ],
        });
    }
    for (const a of awards) {
      if (a.category === 'growth') continue;
      const sc = scores.find((s) => s.user_id === a.user_id);
      lines.push({
        cls: a.class_name ?? '',
        no: a.student_no ?? 0,
        cells: [
          a.class_name,
          a.student_no,
          a.name,
          CATEGORY_LABEL[a.category],
          sc?.points ?? '',
          a.reason ?? '',
        ],
      });
    }
    lines.sort((x, y) => x.cls.localeCompare(y.cls, 'ko', { numeric: true }) || x.no - y.no);
    for (const l of lines) rows.push(l.cells);
    sendCsv(res, `선물명단_${month}.csv`, rows);
  });

  return router;
}
