import { useEffect, type ReactNode } from 'react';

const SITE = '초롱 RAS 포인트';

/** 페이지 제목. 브라우저 탭 제목도 "제목 · 초롱 RAS 포인트" 로 맞춘다 (QA #22) */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-base text-ink-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
