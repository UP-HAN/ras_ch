import type { ReactNode } from 'react';
import { Mascot } from '@/components/fun/Mascot';
import { cn } from '@/lib/cn';
import type { MascotKey } from '@/lib/illustrations';

/**
 * 빈 화면 (01-spec 6.3): 흰 바탕 둥근 상자. illustration 이 있으면 이모지 대신 초롱이가 둥실(6.4 #8).
 * 그림을 못 불러오면 icon 이모지를 대신 보여 준다.
 */
export function EmptyState({
  icon = '🏮',
  illustration,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  illustration?: MascotKey;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const emoji = (
    <div className="mb-3 text-4xl" aria-hidden="true">
      {icon}
    </div>
  );
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-line bg-surface px-6 py-8 text-center',
        className,
      )}
    >
      {illustration ? (
        <Mascot name={illustration} size={120} className="anim-float mb-2" fallback={emoji} />
      ) : (
        emoji
      )}
      <p className="text-lg font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-base text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
