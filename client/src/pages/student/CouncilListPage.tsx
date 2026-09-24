import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { councilApi } from '@/api/council';
import { CouncilCard } from '@/components/council/CouncilCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/cn';

type Scope = 'live' | 'past' | 'drafts';

/** 자치회 글 목록 (CNC-01): 게시 중 / 지난 글 / (임원) 작성 중 */
export function CouncilList({ standalone = false }: { standalone?: boolean }) {
  const { me } = useMe();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('live');
  const isCouncil = !!me?.isCouncil;
  const q = useQuery({
    queryKey: ['council', 'list', scope],
    queryFn: () => councilApi.list(scope),
  });
  const tabs: Array<{ key: Scope; label: string }> = [
    { key: 'live', label: '게시 중' },
    { key: 'past', label: '지난 글' },
    ...(isCouncil ? [{ key: 'drafts' as const, label: '작성 중' }] : []),
  ];
  return (
    <div>
      <div
        role="tablist"
        className={cn(
          'mb-3 grid gap-1 rounded-lg bg-accent-50 p-1',
          tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
        )}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={scope === t.key}
            onClick={() => setScope(t.key)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              scope === t.key ? 'bg-surface text-accent-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isCouncil && standalone && (
        <Button
          block
          variant="secondary"
          className="mb-3"
          onClick={() => navigate('/write/council')}
        >
          ✏️ 자치회 글 쓰기
        </Button>
      )}
      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" className="text-accent-600" />
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <EmptyState
          icon="🏫"
          title={scope === 'live' ? '지금 게시 중인 자치회 글이 없어요' : '아직 글이 없어요'}
          description={scope === 'live' ? '자치회 임원이 올리면 여기에 보여요.' : undefined}
        />
      )}
      <div className="space-y-3">
        {q.data?.map((p) => (
          <CouncilCard key={p.id} post={p} showStatus={scope === 'drafts'} />
        ))}
      </div>
    </div>
  );
}

export function CouncilListPage() {
  return (
    <>
      <PageHeader
        title="학생자치회 게시판"
        description="자치회 임원이 올리는 공지·홍보·투표예요."
      />
      <CouncilList standalone />
    </>
  );
}
