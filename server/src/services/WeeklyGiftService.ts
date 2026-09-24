/**
 * 주간 선물 수시 지급 (HOF-01a, 01b) — 승인 권한 교사
 *  - 대상: 지난 주차 weekly_scores 학년별 상위 N(동점 포함, 0P 제외) ∪ 개별 선택
 *  - WEEKLY_GIFT 20P, occurredAt = 그 주 월요일(주 1회 상한이 그 주차로 잡힘), eventKey WEEKLY_GIFT:weekly_gift:{id}
 *  - 취소 → cancelled + 회수(이력 보존). 재지급은 같은 행을 다시 active 로
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import type { CsvCell } from '../lib/csvWrite.js';
import { notify } from '../lib/notify.js';
import { isWeekKey, weekKey as currentWeekKey, weekRange } from '../lib/time.js';
import { selectGiftTargets } from '../lib/weeklyGift.js';
import { ensureWeeklyTop } from '../jobs/weeklyTop.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as weeklyGiftRepo from '../repos/weeklyGiftRepo.js';
import * as weeklyRepo from '../repos/weeklyRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { WeeklyGiftPanelView, WeeklyGiftResult } from '../types/api.js';
import { gamifySetting } from './GamifyService.js';
import { applyPointsSafe, reversePointsSafe } from './points/safeApply.js';

function assertPastWeek(wk: string): void {
  if (!isWeekKey(wk)) throw AppError.badRequest('주차 형식이 올바르지 않아요.');
  if (wk >= currentWeekKey())
    throw AppError.badRequest('이번 주는 아직 집계 전이에요. 지난주부터 줄 수 있어요.');
}

export async function panel(wk: string): Promise<WeeklyGiftPanelView> {
  assertPastWeek(wk);
  await ensureWeeklyTop(wk);
  const perGrade = (await gamifySetting()).weeklyGiftPerGrade;
  const rows = await weeklyRepo.listWeekScores(wk);
  const gifts = new Map(
    (await weeklyGiftRepo.listByWeek(wk))
      .filter((g) => g.status === 'active')
      .map((g) => [g.user_id, g]),
  );
  const candidates = rows
    .filter((r) => r.points > 0)
    .map((r) => ({
      userId: r.user_id,
      name: r.name,
      displayName: r.display_name,
      className: r.class_name,
      grade: r.grade,
      studentNo: r.student_no,
      points: r.points,
      rankInGrade: r.rank_in_grade,
      gifted: gifts.has(r.user_id),
      method: gifts.get(r.user_id)?.method ?? null,
    }));
  return { weekKey: wk, perGrade, candidates, giftedCount: gifts.size };
}

export interface GrantInput {
  topN?: number;
  userIds?: number[];
  note?: string;
}

export async function grant(
  actor: AuthUser,
  wk: string,
  input: GrantInput,
  ip?: string,
): Promise<WeeklyGiftResult> {
  assertPastWeek(wk);
  const topN = input.topN ?? 0;
  if (!Number.isInteger(topN) || topN < 0 || topN > 30)
    throw AppError.badRequest('학년별 인원은 0~30명 사이예요.');
  await ensureWeeklyTop(wk);
  const rows = await weeklyRepo.listWeekScores(wk);
  const targets = selectGiftTargets(
    rows.map((r) => ({
      userId: r.user_id,
      grade: r.grade,
      points: r.points,
      rankInGrade: r.rank_in_grade,
    })),
    topN,
    input.userIds ?? [],
  );
  if (targets.length === 0)
    throw AppError.badRequest('선물을 줄 학생이 없어요. 인원이나 학생을 골라 주세요.');
  const note = input.note?.trim() || null;
  const monday = weekRange(wk).start.toDate();
  const label = `${wk.slice(0, 4)}년 ${Number(wk.slice(6))}주차`;
  let granted = 0;
  let skipped = 0;
  await tx(async (conn) => {
    for (const t of targets) {
      const existing = await weeklyGiftRepo.findByWeekUser(wk, t.userId, conn, true);
      if (existing?.status === 'active') {
        skipped += 1;
        continue;
      }
      let id: number;
      if (existing) {
        await weeklyGiftRepo.reactivate(
          existing.id,
          { grantedBy: actor.row.id, method: t.method, note },
          conn,
        );
        id = existing.id;
      } else {
        id = await weeklyGiftRepo.insertGift(
          { weekKey: wk, userId: t.userId, grantedBy: actor.row.id, method: t.method, note },
          conn,
        );
      }
      await applyPointsSafe(
        {
          ruleCode: 'WEEKLY_GIFT',
          userId: t.userId,
          refType: 'weekly_gift',
          refId: id,
          occurredAt: monday,
          grantedBy: actor.row.id,
          note: `${label} 주간 선물`,
          eventKey: `WEEKLY_GIFT:weekly_gift:${id}`,
        },
        conn,
      );
      await notify(
        t.userId,
        'weekly_gift',
        {
          message: `🎁 ${label} 주간 선물을 받았어요! 명예의 전당에서 확인해요.`,
          link: '/hall-of-fame',
        },
        conn,
      );
      granted += 1;
    }
    await writeAudit(
      {
        actorId: actor.row.id,
        action: 'weekly_gift.grant',
        targetType: 'week',
        payload: { weekKey: wk, topN, userIds: input.userIds ?? [], granted, skipped },
        ip,
      },
      conn,
    );
  });
  return { weekKey: wk, granted, skipped, panel: await panel(wk) };
}

export async function cancel(
  actor: AuthUser,
  wk: string,
  userId: number,
  ip?: string,
): Promise<WeeklyGiftPanelView> {
  assertPastWeek(wk);
  await tx(async (conn) => {
    const g = await weeklyGiftRepo.findByWeekUser(wk, userId, conn, true);
    if (!g || g.status !== 'active')
      throw AppError.notFound('이 학생은 이 주에 선물을 받지 않았어요.');
    await weeklyGiftRepo.cancel(g.id, actor.row.id, conn);
    await reversePointsSafe(
      'weekly_gift',
      g.id,
      { note: 'weekly_gift.cancel', actorId: actor.row.id },
      conn,
    );
    await writeAudit(
      {
        actorId: actor.row.id,
        action: 'weekly_gift.cancel',
        targetType: 'weekly_gift',
        targetId: g.id,
        payload: { weekKey: wk, userId },
        ip,
      },
      conn,
    );
  });
  return panel(wk);
}

/** 선물 명단 CSV (반별·실명) */
export async function giftCsv(wk: string): Promise<{ filename: string; rows: CsvCell[][] }> {
  assertPastWeek(wk);
  const p = await panel(wk);
  const rows: CsvCell[][] = [['반', '번호', '이름', '주간 포인트', '학년 순위', '구분']];
  const lines = p.candidates
    .filter((c) => c.gifted)
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className, 'ko', { numeric: true }) ||
        (a.studentNo ?? 0) - (b.studentNo ?? 0),
    );
  for (const c of lines)
    rows.push([
      c.className,
      c.studentNo,
      c.name,
      c.points,
      `${c.grade}학년 ${c.rankInGrade}위`,
      c.method === 'manual' ? '개별 선택' : '상위',
    ]);
  return { filename: `주간선물_${wk}.csv`, rows };
}
