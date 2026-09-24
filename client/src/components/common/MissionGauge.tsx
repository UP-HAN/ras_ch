import { cn } from '@/lib/cn';

/** 진행률 막대 (이번 주 미션·학급 미션·등급 진행) */
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
  const bar =
    tone === 'accent' ? 'bg-accent-500' : tone === 'success' ? 'bg-success-600' : 'bg-primary-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-4 w-full overflow-hidden rounded-full bg-primary-100', className)}
    >
      <div className={cn('h-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
