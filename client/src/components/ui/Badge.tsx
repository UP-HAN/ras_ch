import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-primary-50 text-ink border-line',
  primary: 'bg-primary-100 text-primary-800 border-primary-200',
  success: 'bg-success-50 text-success-600 border-success-600/30',
  warn: 'bg-warn-50 text-warn-600 border-warn-600/30',
  danger: 'bg-danger-50 text-danger-600 border-danger-600/30',
  info: 'bg-info-50 text-info-600 border-info-600/30',
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
        'inline-flex items-center rounded-full border px-3 py-1 text-base font-semibold leading-none',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
