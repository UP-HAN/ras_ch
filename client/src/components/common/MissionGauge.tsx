import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/motion';

/**
 * 진행률 막대 (이번 주 미션·학급 미션·등급 진행).
 * 01-spec 6.3: 높이 20px, 흰 바탕 + 2px 테두리, 채움은 무지개(primary)/민트(success)/하늘(accent).
 * 6.4 #6: 너비 0 → 값(900ms), 다 차면 하얀 빛이 1번 지나간다.
 */
export function MissionGauge({
  value,
  max,
  label,
  tone = 'primary',
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'primary' | 'accent' | 'success';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const reduced = usePrefersReducedMotion();
  const animate = !reduced && typeof requestAnimationFrame !== 'undefined';
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!animate) return;
    // 한 프레임 뒤에 값을 넣어야 0 → 값 으로 늘어나는 움직임이 보인다
    const raf = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct, animate]);
  const width = animate ? shown : pct;

  const bar =
    tone === 'accent' ? 'bg-accent-500' : tone === 'success' ? 'bg-mint-400' : 'bg-rainbow';
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn(
        'relative h-5 w-full overflow-hidden rounded-full border-2 border-line bg-surface',
        className,
      )}
    >
      <div
        className={cn('anim-gauge-fill h-full rounded-full', bar)}
        style={{ width: `${width}%` }}
      />
      {pct >= 100 && (
        <span
          aria-hidden="true"
          className="anim-gauge-shine pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.75),transparent)]"
        />
      )}
    </div>
  );
}
