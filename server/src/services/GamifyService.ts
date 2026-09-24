/**
 * 게이미피케이션 설정 (PT-07 등급 구간, 주간 선물 학년별 N, 학급 미션 목표) — settings.tier_thresholds / settings.gamify
 */
import { AppError } from '../lib/apiResponse.js';
import { TIER_ORDER, type TierThresholds } from '../lib/tiers.js';
import { writeAudit } from '../repos/auditRepo.js';
import { getSetting, setSetting } from '../repos/settingsRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { GamifySettingsView } from '../types/api.js';
import { refreshAllTiers, tierThresholds } from './TierService.js';

export interface GamifySetting {
  weeklyGiftPerGrade: number;
  classMissionReportRate: number;
}

export const DEFAULT_GAMIFY: GamifySetting = { weeklyGiftPerGrade: 3, classMissionReportRate: 80 };

export async function gamifySetting(): Promise<GamifySetting> {
  const g = await getSetting<Partial<GamifySetting>>('gamify', DEFAULT_GAMIFY);
  return { ...DEFAULT_GAMIFY, ...g };
}

export async function gamifySettingsView(): Promise<GamifySettingsView> {
  return { tierThresholds: await tierThresholds(), ...(await gamifySetting()) };
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

export function validateGamifySettings(input: GamifySettingsView): string | null {
  const t = input.tierThresholds as Partial<TierThresholds>;
  const keys = TIER_ORDER.slice(1) as Array<keyof TierThresholds>;
  let prev = 0;
  for (const k of keys) {
    const v = t[k];
    if (!isInt(v) || v <= prev)
      return '등급 구간은 새싹 < 꽃 < 열매 < 초롱별 순서로 커지는 정수여야 해요.';
    prev = v;
  }
  if (
    !isInt(input.weeklyGiftPerGrade) ||
    input.weeklyGiftPerGrade < 0 ||
    input.weeklyGiftPerGrade > 30
  )
    return '주간 선물 학년별 인원은 0~30명 사이예요.';
  if (
    !isInt(input.classMissionReportRate) ||
    input.classMissionReportRate < 10 ||
    input.classMissionReportRate > 100
  )
    return '학급 미션 목표 제출률은 10~100% 사이예요.';
  return null;
}

export async function updateGamifySettings(
  actor: AuthUser,
  input: GamifySettingsView,
  ip?: string,
): Promise<GamifySettingsView> {
  const problem = validateGamifySettings(input);
  if (problem) throw AppError.badRequest(problem);
  const { sprout, flower, fruit, star } = input.tierThresholds;
  await setSetting('tier_thresholds', { sprout, flower, fruit, star }, actor.row.id);
  await setSetting(
    'gamify',
    {
      weeklyGiftPerGrade: input.weeklyGiftPerGrade,
      classMissionReportRate: input.classMissionReportRate,
    },
    actor.row.id,
  );
  await writeAudit({
    actorId: actor.row.id,
    action: 'settings.gamify',
    targetType: 'settings',
    payload: { ...input },
    ip,
  });
  // 구간이 바뀌면 전원 재계산(강등 없음)
  await refreshAllTiers();
  return gamifySettingsView();
}
