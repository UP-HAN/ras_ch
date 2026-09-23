import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { postsApi } from '@/api/posts';
import { articlesApi } from '@/api/reactions';
import { PageHeader } from '@/components/layout/PageHeader';
import { ArticleCard } from '@/components/post/ArticleCard';
import { ARTICLE_TAGS } from '@/components/post/articleMeta';
import { ReportCard } from '@/components/post/ReportCard';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'class', label: '우리 반' },
  { key: 'school', label: '전교 리포트' },
  { key: 'articles', label: '기사' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** 둘러보기 (6.1, RPT-07, ART-04 정렬·영역·기자단 필터, CMN-04 더 보기) */
export function PostListPage() {
  const [tab, setTab] = useState<Tab>('class');
  const [sort, setSort] = useState<'latest' | 'likes'>('latest');
  const [tag, setTag] = useState<string>('');
  const [reporter, setReporter] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ['posts', 'list', tab, sort, tag, reporter],
    queryFn: ({ pageParam }) =>
      tab === 'articles'
        ? articlesApi.list({ sort, tag, reporter }, pageParam)
        : postsApi.list(tab, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  // CMN-04 무한 스크롤: 끝 센티널이 보이면 다음 20건. 버튼은 폴백
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <PageHeader title="둘러보기" />
      <div role="tablist" className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-primary-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              tab === t.key ? 'bg-surface text-primary-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'articles' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={sort === 'latest' ? 'primary' : 'secondary'}
            onClick={() => setSort('latest')}
          >
            최신순
          </Button>
          <Button
            variant={sort === 'likes' ? 'primary' : 'secondary'}
            onClick={() => setSort('likes')}
          >
            엄지척순
          </Button>
          {ARTICLE_TAGS.map((t) => (
            <Button
              key={t.key}
              variant={tag === t.key ? 'primary' : 'ghost'}
              onClick={() => setTag(tag === t.key ? '' : t.key)}
            >
              {t.emoji} {t.label}
            </Button>
          ))}
          <Button variant={reporter ? 'primary' : 'ghost'} onClick={() => setReporter((v) => !v)}>
            📰 기자단
          </Button>
        </div>
      )}
      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" className="text-primary-600" />
        </div>
      )}
      {!q.isLoading && items.length === 0 && (
        <EmptyState
          title={tab === 'articles' ? '아직 게시된 기사가 없어요' : '아직 게시된 리포트가 없어요'}
          description="선생님이 승인하면 여기에 보여요."
        />
      )}
      <div className="space-y-3">
        {items.map((p) =>
          p.type === 'article' ? (
            <ArticleCard key={p.id} post={p} />
          ) : (
            <ReportCard key={p.id} post={p} />
          ),
        )}
      </div>
      <div ref={sentinel} aria-hidden="true" className="h-1" />
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
