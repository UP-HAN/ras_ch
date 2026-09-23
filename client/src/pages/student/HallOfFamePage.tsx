import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = ['주간 TOP', '월간', '학급', '역대'] as const;

/** 명예의 전당 4탭 자리 (HOF-06). 데이터는 S5 5-4 */
export function HallOfFamePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('주간 TOP');
  return (
    <>
      <PageHeader title="명예의 전당" />
      <div
        role="tablist"
        aria-label="명예의 전당 구분"
        className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-primary-100 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              tab === t ? 'bg-surface text-primary-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <EmptyState
        icon="🏆"
        title={`${tab} 명단이 아직 없어요`}
        description="매주 월요일 아침에 새로 올라와요."
      />
    </>
  );
}
