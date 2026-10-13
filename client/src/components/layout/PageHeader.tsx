import { useEffect, type ReactNode } from 'react';
import { Mascot } from '@/components/fun/Mascot';
import type { MascotKey } from '@/lib/illustrations';

const SITE = '초롱 RAS 포인트';

/** 페이지 제목. 브라우저 탭 제목도 "제목 · 초롱 RAS 포인트" 로 맞춘다 (QA #22) */
export function PageHeader({
  title,
  description,
  action,
  illustration,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** 오른쪽에 둥실 떠 있는 초롱이 (01-spec 6.3) */
  illustration?: MascotKey;
}) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · ${SITE}` : SITE;
    return () => {
      document.title = prev;
    };
  }, [title]);
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        <div aria-hidden="true" className="bg-rainbow mt-1.5 h-1 w-12 rounded-full" />
        {description && <p className="mt-2 text-base text-ink-muted">{description}</p>}
      </div>
      {(action || illustration) && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {illustration && <Mascot name={illustration} size={80} sticker className="anim-float" />}
        </div>
      )}
    </header>
  );
}
