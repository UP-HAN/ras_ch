import type { Tier } from '@server-types/db';

/** 등급 배지 표시 (PT-07). 서버 lib/tiers.ts 와 같은 값 */
export const TIER_META: Record<Tier, { emoji: string; label: string }> = {
  seed: { emoji: '🌰', label: '씨앗' },
  sprout: { emoji: '🌱', label: '새싹' },
  flower: { emoji: '🌸', label: '꽃' },
  fruit: { emoji: '🍎', label: '열매' },
  star: { emoji: '⭐', label: '초롱별' },
};

export const TIER_ORDER: Tier[] = ['seed', 'sprout', 'flower', 'fruit', 'star'];
