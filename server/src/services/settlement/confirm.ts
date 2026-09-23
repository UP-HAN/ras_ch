/**
 * 월간 결산 확정 (HOF-02, 02c, 05, 08, ADM-03)
 *  한 트랜잭션: 인원·예외 반영 재계산 → 스냅샷 저장 → 3부문 선정 기록 → MONTHLY_TOP/GROWTH_AWARD/MONTHLY_AWARD 지급 → 알림 → confirmed
 */
import { tx } from '../../db/query.js';
import { AppError } from '../../lib/apiResponse.js';
import { notify } from '../../lib/notify.js';
import { writeAudit } from '../../repos/auditRepo.js';
import * as settlementRepo from '../../repos/settlementRepo.js';
import type { AuthUser } from '../../types/auth.js';
import type { ConfirmSettlementInput, ConfirmSettlementResult } from '../../types/api.js';
import { applyPointsSafe } from '../points/safeApply.js';
import type { RuleCode } from '../points/types.js';
import { CATEGORY_LABEL } from './awards.js';
import { buildSettlement, persistSnapshot } from './draft.js';
import { settlementView } from './views.js';

const monthLabel = (monthKey: string) => `${Number(monthKey.slice(5, 7))}월`;

export async function confirmSettlement(
  actor: AuthUser,
  monthKey: string,
  input: ConfirmSettlementInput,
  ip?: string,
): Promise<ConfirmSettlementResult> {
  const existing = await settlementRepo.findByMonth(monthKey);
  if (!existing) throw AppError.notFound('먼저 결산 초안을 만들어 주세요.');
  if (existing.status === 'confirmed') throw AppError.conflict('이미 확정된 결산이에요.');
  if (
    !Number.isInteger(input.perGradeGiftCount) ||
    input.perGradeGiftCount < 0 ||
    input.perGradeGiftCount > 30
  )
    throw AppError.badRequest('학년별 선물 인원은 0~30명 사이예요.');
  if (
    !Number.isInteger(input.perGradeGrowthCount) ||
    input.perGradeGrowthCount < 0 ||
    input.perGradeGrowthCount > 10
  )
    throw AppError.badRequest('학년별 성장률 인원은 0~10명 사이예요.');
  for (const a of input.awards) {
    if (!a.reason || a.reason.trim().length < 2 || a.reason.trim().length > 200)
      throw AppError.badRequest('선정 이유를 2~200자로 적어 주세요.');
  }
  // 참여왕은 실천왕·기자 선정자와 중복 불가 (7.4)
  const selectedIds = (cat: string) =>
    new Set(input.awards.filter((a) => a.category === cat).map((a) => a.userId));
  const pf = selectedIds('phonefree');
  const rp = selectedIds('reporter');
  for (const uid of selectedIds('participation')) {
    if (pf.has(uid) || rp.has(uid))
      throw AppError.badRequest('참여왕은 실천왕·기자로 뽑힌 학생과 겹칠 수 없어요.');
  }
  const candidates = await settlementRepo.listAwards(monthKey);
  for (const a of input.awards) {
    if (!candidates.some((c) => c.category === a.category && c.user_id === a.userId))
      throw AppError.badRequest(
        '후보 목록에 없는 학생은 선정할 수 없어요. 초안을 다시 만들어 주세요.',
      );
  }

  const built = await buildSettlement(monthKey, {
    perGradeGiftCount: input.perGradeGiftCount,
    perGradeGrowthCount: input.perGradeGrowthCount,
    overrides: {
      userIds: new Set(input.allowConsecutiveUserIds),
      allowClass: input.allowConsecutiveClass,
    },
  });
  const awardRows: settlementRepo.AwardInsert[] = built.awards.map((c) => {
    const sel = input.awards.find((a) => a.category === c.category && a.userId === c.userId);
    return {
      category: c.category,
      userId: c.userId,
      grade: c.grade,
      score: c.score,
      breakdown: c.breakdown,
      rankInGrade: c.rankInGrade,
      status: sel ? 'selected' : 'candidate',
      reason: sel ? sel.reason.trim() : null,
      confirmedBy: sel ? actor.row.id : null,
    };
  });
  for (const g of built.growth.filter((x) => x.selected)) {
    awardRows.push({
      category: 'growth',
      userId: g.userId,
      grade: g.grade,
      score: g.growthRate * 100,
      breakdown: { 이번달: g.points, 지난달: g.prevPoints },
      rankInGrade: g.rankInGrade,
      status: 'selected',
      reason: null,
      confirmedBy: actor.row.id,
    });
  }

  const granted = { monthlyTop: 0, growth: 0, awards: 0 };
  const warnings: string[] = [];
  await tx(async (conn) => {
    const id = await persistSnapshot(built, conn, awardRows);
    const grant = async (code: RuleCode, userId: number, note: string) => {
      const r = await applyPointsSafe(
        {
          ruleCode: code,
          userId,
          refType: 'settlement',
          refId: id,
          note,
          eventKey: `${code}:settlement:${id}:u${userId}`,
        },
        conn,
      );
      return r.granted;
    };
    for (const r of built.ranking.filter((x) => x.selected)) {
      if (await grant('MONTHLY_TOP', r.userId, `${monthLabel(monthKey)} 포인트 상위 선정`))
        granted.monthlyTop += 1;
    }
    for (const g of built.growth.filter((x) => x.selected)) {
      if (await grant('GROWTH_AWARD', g.userId, `${monthLabel(monthKey)} 성장률 부문 선정`))
        granted.growth += 1;
      await notify(
        g.userId,
        'award',
        {
          message: `🌱 ${monthLabel(monthKey)} 성장률 부문에 뽑혔어요! 지난달보다 ${Math.round(g.growthRate * 100)}% 성장했어요.`,
          link: '/hall-of-fame',
        },
        conn,
      );
    }
    const awardedUsers = new Set<number>();
    for (const a of input.awards) {
      const label = CATEGORY_LABEL[a.category];
      if (!awardedUsers.has(a.userId)) {
        if (await grant('MONTHLY_AWARD', a.userId, `${monthLabel(monthKey)} ${label}`))
          granted.awards += 1;
        awardedUsers.add(a.userId);
      } else {
        warnings.push(`같은 학생이 두 부문에 선정되어 MONTHLY_AWARD 는 한 번만 지급했어요.`);
      }
      await notify(
        a.userId,
        'award',
        {
          message: `🏆 ${monthLabel(monthKey)} ${label}으로 뽑혔어요! ${a.reason.trim()}`,
          link: '/hall-of-fame',
        },
        conn,
      );
    }
    const winner = built.classes.find((c) => c.isWinner) ?? null;
    await settlementRepo.markConfirmed(
      id,
      {
        confirmedBy: actor.row.id,
        note: input.note?.trim() || null,
        perGradeGiftCount: input.perGradeGiftCount,
        perGradeGrowthCount: input.perGradeGrowthCount,
        winnerClassId: winner?.classId ?? null,
      },
      conn,
    );
    await writeAudit(
      {
        actorId: actor.row.id,
        action: 'settlement.confirm',
        targetType: 'settlement',
        targetId: id,
        payload: {
          monthKey,
          ...granted,
          awards: input.awards.length,
          allowConsecutive: input.allowConsecutiveUserIds.length,
        },
        ip,
      },
      conn,
    );
  });
  const settlement = await settlementView(monthKey, await settlementRepo.findByMonth(monthKey));
  return { settlement, granted, warnings: [...warnings, ...settlement.warnings] };
}
