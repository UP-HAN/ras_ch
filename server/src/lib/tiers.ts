/**
 * 등급 배지 (PT-07): 누적 포인트 구간 → 씨앗/새싹/꽃/열매/초롱별. 구간은 settings.tier_thresholds
 *  - 누적은 "명예"라 회수로 포인트가 줄어도 강등하지 않는다(서비스에서 max 처리)
 */
import type { Tier } from '../types/db.js';

export interface TierThresholds {
  sprout: number;
  flower: number;
  fruit: number;
  star: number;
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  sprout: 200,
  flower: 500,
  fruit: 1000,
  star: 2000,
};

export const TIER_ORDER: Tier[] = ['seed', 'sprout', 'flower', 'fruit', 'star'];

export const TIER_META: Record<Tier, { emoji: string; label: string }> = {
  seed: { emoji: '🌰', label: '씨앗' },
  sprout: { emoji: '🌱', label: '새싹' },
  flower: { emoji: '🌸', label: '꽃' },
  fruit: { emoji: '🍎', label: '열매' },
  star: { emoji: '⭐', label: '초롱별' },
};

export function tierFor(points: number, t: TierThresholds = DEFAULT_TIER_THRESHOLDS): Tier {
  if (points >= t.star) return 'star';
  if (points >= t.fruit) return 'fruit';
  if (points >= t.flower) return 'flower';
  if (points >= t.sprout) return 'sprout';
  return 'seed';
}

export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/** 다음 등급까지 남은 포인트 (최고 등급이면 null) */
export function nextTierInfo(
  points: number,
  tier: Tier,
  t: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): { next: Tier; needed: number; from: number; to: number } | null {
  const i = tierRank(tier);
  const next = TIER_ORDER[i + 1];
  if (!next) return null;
  const to = t[next as keyof TierThresholds];
  const from = i === 0 ? 0 : t[tier as keyof TierThresholds];
  return { next, needed: Math.max(0, to - points), from, to };
}

/** 강등 없음: 계산 등급이 현재보다 낮으면 현재 유지 */
export function resolveTier(points: number, current: Tier, t?: TierThresholds): Tier {
  const computed = tierFor(points, t);
  return tierRank(computed) > tierRank(current) ? computed : current;
}
