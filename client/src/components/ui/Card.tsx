import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  /** 강조 카드(홈 상단 상태 카드 등) */
  tone?: 'default' | 'primary' | 'accent';
}

const TONE = {
  default: 'bg-surface border-line',
  primary: 'bg-primary-50 border-primary-200',
  accent: 'bg-accent-50 border-accent-100',
};

export function Card({ title, action, tone = 'default', className, children, ...rest }: CardProps) {
  return (
    <section className={cn('rounded-lg border p-4 shadow-card', TONE[tone], className)} {...rest}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
