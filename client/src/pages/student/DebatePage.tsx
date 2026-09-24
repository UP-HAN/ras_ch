import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { NewsProposalInput } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { newsApi } from '@/api/news';
import { PageHeader } from '@/components/layout/PageHeader';
import { TopicCard } from '@/components/news/TopicCard';
import { Button, Card, EmptyState, Input, Spinner, Textarea } from '@/components/ui';
import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/cn';

const TAGS = ['RAS', '폰프리', '미디어', '학교생활', '환경', '과학', '기타'];

function ProposeForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<NewsProposalInput>({
    title: '',
    body: '',
    type: 'vote',
    questions: ['', ''],
    tags: [],
    sourceUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      newsApi.propose({ ...form, questions: form.questions.filter((q) => q.trim()) }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  const bodyLen = Array.from(form.body.trim()).length;
  return (
    <Card title="토론 주제 제안하기" tone="accent">
      <p className="mb-3 text-base text-ink-muted">
        제안한 주제는 선생님이 확인한 뒤 주제 은행에 들어가요.
      </p>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['vote', 'open'] as const).map((t) => (
            <Button
              key={t}
              variant={form.type === t ? 'primary' : 'secondary'}
              onClick={() => setForm((f) => ({ ...f, type: t }))}
            >
              {t === 'vote' ? '찬반 토론' : '자유 의견'}
            </Button>
          ))}
        </div>
        <Input
          label="제목 (40자 이내)"
          value={form.title}
          maxLength={40}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <Textarea
          label="쉬운 설명 (80~400자)"
          value={form.body}
          rows={4}
          maxLength={400}
          hint={`${bodyLen}자`}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
        {form.questions.map((q, i) => (
          <Input
            key={i}
            label={`생각 열기 질문 ${i + 1}`}
            value={q}
            maxLength={100}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                questions: f.questions.map((x, j) => (j === i ? e.target.value : x)),
              }))
            }
          />
        ))}
        <div>
          <p className="mb-1 text-base font-semibold">태그</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <Button
                key={tag}
                variant={form.tags.includes(tag) ? 'primary' : 'ghost'}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag],
                  }))
                }
              >
                #{tag}
              </Button>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-base font-medium text-danger-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            제안 보내기
          </Button>
          <Button variant="ghost" onClick={onDone}>
            닫기
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** 토론방 (6.1): 진행 중 주제(최대 3) / 지난 토론 아카이브 (NWS-10) */
export function DebatePage() {
  const { me } = useMe();
  const [tab, setTab] = useState<'live' | 'closed'>('live');
  const [proposing, setProposing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const live = useQuery({ queryKey: ['news', 'live'], queryFn: () => newsApi.list('live') });
  const closed = useInfiniteQuery({
    queryKey: ['news', 'closed'],
    queryFn: ({ pageParam }) => newsApi.list('closed', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'closed',
  });
  const closedItems = closed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="토론방"
        description="뉴스를 읽고, 투표하고, 내 생각을 써 봐요."
        action={
          me?.isCouncil && !proposing ? (
            <Button variant="secondary" onClick={() => setProposing(true)}>
              주제 제안
            </Button>
          ) : undefined
        }
      />
      {proposing && (
        <div className="mb-4">
          <ProposeForm
            onDone={() => {
              setProposing(false);
              setMsg('제안을 보냈어요. 선생님이 확인하면 주제 은행에 들어가요.');
            }}
          />
        </div>
      )}
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-primary-100 p-1">
        {(
          [
            ['live', '진행 중'],
            ['closed', '지난 토론'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              tab === k ? 'bg-surface text-primary-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'live' && (
        <>
          {live.isLoading && <Spinner size="lg" className="text-primary-600" />}
          {live.data && live.data.items.length === 0 && (
            <EmptyState
              icon="💬"
              title="지금 진행 중인 토론이 없어요"
              description="새 토론 주제는 정해진 요일 아침 8시에 올라와요."
            />
          )}
          <div className="space-y-3">
            {live.data?.items.map((t) => (
              <TopicCard key={t.id} t={t} />
            ))}
          </div>
        </>
      )}
      {tab === 'closed' && (
        <>
          {closed.isLoading && <Spinner size="lg" className="text-primary-600" />}
          {!closed.isLoading && closedItems.length === 0 && (
            <EmptyState icon="📚" title="아직 지난 토론이 없어요" />
          )}
          <div className="space-y-3">
            {closedItems.map((t) => (
              <TopicCard key={t.id} t={t} />
            ))}
          </div>
          {closed.hasNextPage && (
            <Button
              block
              variant="secondary"
              className="mt-4"
              loading={closed.isFetchingNextPage}
              onClick={() => closed.fetchNextPage()}
            >
              더 보기
            </Button>
          )}
        </>
      )}
    </>
  );
}
