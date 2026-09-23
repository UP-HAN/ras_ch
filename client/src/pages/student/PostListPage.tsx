import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { postsApi } from '@/api/posts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReportCard } from '@/components/post/ReportCard';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'class', label: '우리 반 리포트' },
  { key: 'school', label: '전교 리포트' },
] as const;

/** 둘러보기 (6.1, RPT-07, CMN-04 더 보기) */
export function PostListPage() {
  const [scope, setScope] = useState<'class' | 'school'>('class');
  const q = useInfiniteQuery({
    queryKey: ['posts', 'list', scope],
    queryFn: ({ pageParam }) => postsApi.list(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="둘러보기" />
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-primary-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={scope === t.key}
            onClick={() => setScope(t.key)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              scope === t.key ? 'bg-surface text-primary-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" className="text-primary-600" />
        </div>
      )}
      {!q.isLoading && items.length === 0 && (
        <EmptyState
          title="아직 게시된 리포트가 없어요"
          description="선생님이 승인하면 여기에 보여요."
        />
      )}
      <div className="space-y-3">
        {items.map((p) => (
          <ReportCard key={p.id} post={p} />
        ))}
      </div>
      {q.hasNextPage && (
        <Button
          block
          variant="secondary"
          className="mt-4"
          loading={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          더 보기
        </Button>
      )}
    </>
  );
}
