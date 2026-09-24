import type { Tier } from '@server-types/db';
import { TIER_META } from '@/lib/gamify';
import { cn } from '@/lib/cn';

/** 등급 배지 (PT-07): 이모지 + 이름. compact 면 이모지만(이름은 title 로) */
export function TierBadge({
  tier,
  compact = false,
  className,
}: {
  tier: Tier;
  compact?: boolean;
  className?: string;
}) {
  const m = TIER_META[tier] ?? TIER_META.seed;
  return (
    <span
      title={`${m.label} 등급`}
      aria-label={`${m.label} 등급`}
      data-testid="tier-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-base font-semibold leading-none text-primary-800',
        className,
      )}
    >
      <span aria-hidden="true">{m.emoji}</span>
      {!compact && <span>{m.label}</span>}
    </span>
  );
}
