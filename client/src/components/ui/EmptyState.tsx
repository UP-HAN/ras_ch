import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon = '🏮',
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 text-4xl" aria-hidden="true">
        {icon}
      </div>
      <p className="text-lg font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-base text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
