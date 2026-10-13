import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warn'
  | 'danger'
  | 'info'
  | 'sun'
  | 'mint'
  | 'sky'
  | 'berry'
  | 'grape';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-primary-50 text-ink border-line',
  primary: 'bg-primary-100 text-primary-800 border-primary-200',
  success: 'bg-success-50 text-success-600 border-success-600/30',
  warn: 'bg-warn-50 text-warn-600 border-warn-600/30',
  danger: 'bg-danger-50 text-danger-600 border-danger-600/30',
  info: 'bg-info-50 text-info-600 border-info-600/30',
  sun: 'bg-sun-100 text-sun-700 border-sun-400/60',
  mint: 'bg-mint-100 text-mint-700 border-mint-400/60',
  sky: 'bg-sky-100 text-sky-700 border-sky-400/60',
  berry: 'bg-berry-100 text-berry-700 border-berry-400/60',
  grape: 'bg-grape-100 text-grape-700 border-grape-400/60',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border-2 px-3 py-1 text-base font-bold leading-none',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
