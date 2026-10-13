import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  /** 강조 카드(홈 상단 상태 카드 등). 밝은 색 5계열 + hero(그라데이션) 는 01-spec 3.2·6.3 */
  tone?: CardTone;
}

export type CardTone =
  'default' | 'primary' | 'accent' | 'sun' | 'mint' | 'sky' | 'berry' | 'grape' | 'hero';

const TONE: Record<CardTone, string> = {
  default: 'bg-surface border-line',
  primary: 'bg-primary-50 border-primary-200',
  accent: 'bg-accent-50 border-accent-100',
  sun: 'bg-sun-100 border-sun-400/40',
  mint: 'bg-mint-100 border-mint-400/40',
  sky: 'bg-sky-100 border-sky-400/40',
  berry: 'bg-berry-100 border-berry-400/40',
  grape: 'bg-grape-100 border-grape-400/40',
  hero: 'bg-hero border-primary-200',
};

/** 제목 왼쪽 동그라미 점(장식) 색 */
const DOT: Record<CardTone, string> = {
  default: 'bg-primary-400',
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  sun: 'bg-sun-400',
  mint: 'bg-mint-400',
  sky: 'bg-sky-400',
  berry: 'bg-berry-400',
  grape: 'bg-grape-400',
  hero: 'bg-berry-400',
};

export function Card({ title, action, tone = 'default', className, children, ...rest }: CardProps) {
  return (
    <section
      className={cn('anim-pop-in rounded-xl border-2 p-4 shadow-card', TONE[tone], className)}
      {...rest}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span
                aria-hidden="true"
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[tone])}
              />
              <span className="min-w-0">{title}</span>
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
