import type { Tier } from '@server-types/db';
import { TIER_META } from '@/lib/gamify';
import { cn } from '@/lib/cn';

/** 등급별 색 (01-spec 6.3). star 는 노랑 테두리 + 반짝 1회(6.4 #11) */
const TIER_TONE: Record<Tier, string> = {
  seed: 'bg-[#f3e6d8] text-[#6b4423] border-[#e6d3bd]',
  sprout: 'bg-mint-100 text-mint-700 border-mint-400/50',
  flower: 'bg-berry-100 text-berry-700 border-berry-400/50',
  fruit: 'bg-[#ffe1d6] text-[#b4361a] border-[#ffc2ad]',
  star: 'bg-sun-100 text-sun-700 border-sun-400 anim-sparkle',
};

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
        'inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-base font-bold leading-none',
        TIER_TONE[tier] ?? TIER_TONE.seed,
        className,
      )}
    >
      <span aria-hidden="true">{m.emoji}</span>
      {!compact && <span>{m.label}</span>}
    </span>
  );
}
