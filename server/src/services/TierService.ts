/**
 * 등급 배지 (PT-07): 원장 누적 SUM → settings.tier_thresholds 구간 → users.tier
 *  - LedgerPointService.apply 성공 뒤 store.refreshTier 훅으로 호출된다 (지급마다)
 *  - 강등 없음(회수로 누적이 줄어도 유지). 승급 시 tier_up 알림
 *  - 야간 recountCaches 에서 전원 재계산(refreshAllTiers)
 */
import type { Executor } from '../db/query.js';
import { execute, query, queryOne } from '../db/query.js';
import { getPool } from '../db/pool.js';
import { notify } from '../lib/notify.js';
import {
  DEFAULT_TIER_THRESHOLDS,
  nextTierInfo,
  resolveTier,
  TIER_META,
  type TierThresholds,
} from '../lib/tiers.js';
import { getSetting } from '../repos/settingsRepo.js';
import type { Tier } from '../types/db.js';
import type { TierProgressView } from '../types/api.js';

export async function tierThresholds(): Promise<TierThresholds> {
  const t = await getSetting<Partial<TierThresholds>>('tier_thresholds', DEFAULT_TIER_THRESHOLDS);
  return { ...DEFAULT_TIER_THRESHOLDS, ...t };
}

interface UserTierRow {
  tier: Tier;
  role: string;
  total: number | string | null;
}

async function loadUserTier(userId: number, conn: Executor): Promise<UserTierRow | null> {
  return queryOne<UserTierRow>(
    'SELECT u.tier, u.role, (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id) AS total FROM users u WHERE u.id = ?',
    [userId],
    conn,
  );
}

/** 누적 포인트로 등급을 다시 계산한다. 학생이 아니면 null */
export async function refreshTier(
  userId: number,
  conn: Executor = getPool(),
): Promise<{ tier: Tier; changed: boolean } | null> {
  const row = await loadUserTier(userId, conn);
  if (!row || row.role !== 'student') return null;
  const next = resolveTier(Number(row.total ?? 0), row.tier, await tierThresholds());
  if (next === row.tier) return { tier: next, changed: false };
  await execute('UPDATE users SET tier = ? WHERE id = ?', [next, userId], conn);
  const m = TIER_META[next];
  await notify(
    userId,
    'tier_up',
    { message: `${m.emoji} ${m.label} 등급이 됐어요! 축하해요.`, link: '/me', tier: next },
    conn,
  );
  return { tier: next, changed: true };
}

export async function refreshAllTiers(): Promise<number> {
  const rows = await query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'student' AND status = 'active'",
  );
  let changed = 0;
  for (const r of rows) {
    const res = await refreshTier(r.id);
    if (res?.changed) changed += 1;
  }
  return changed;
}

export async function tierProgress(userId: number): Promise<TierProgressView> {
  const row = await loadUserTier(userId, getPool());
  const tier: Tier = row?.tier ?? 'seed';
  const points = Number(row?.total ?? 0);
  const next = nextTierInfo(points, tier, await tierThresholds());
  return {
    tier,
    emoji: TIER_META[tier].emoji,
    label: TIER_META[tier].label,
    points,
    next: next
      ? {
          tier: next.next,
          emoji: TIER_META[next.next].emoji,
          label: TIER_META[next.next].label,
          needed: next.needed,
          from: next.from,
          to: next.to,
        }
      : null,
  };
}
