import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { reviewApi } from '@/api/review';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';
import { POST_TYPE_LABEL } from '@/lib/reviewLabels';

/** 검토 대기 목록 (APR-02c): 작성자 정보 없이 "○학년 학생"만. 제출 시각순 */
export function ReviewQueuePage() {
  const location = useLocation();
  const flash = (location.state as { message?: string } | null)?.message;
  const summary = useQuery({ queryKey: ['review', 'summary'], queryFn: reviewApi.summary });
  const queue = useQuery({
    queryKey: ['review', 'queue'],
    queryFn: reviewApi.queue,
    enabled: summary.data?.hasAssignment === true,
  });

  if (summary.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!summary.data?.hasAssignment) {
    return (
      <>
        <PageHeader title="리포트 검토" />
        <EmptyState
          icon="🔍"
          title="검토 담당이 아니에요"
          description="자치회 임원이 검토 담당으로 정해지면 여기서 친구들 글을 검토할 수 있어요."
        />
      </>
    );
  }
  const s = summary.data;
  const remaining = Math.max(0, s.dailyCap - s.doneToday);

  return (
    <>
      <PageHeader
        title="리포트 검토"
        description="누가 썼는지는 알 수 없어요. 체크리스트만 확인해요."
        action={<Badge tone="info">오늘 {remaining}건 더 가능</Badge>}
      />
      {flash && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">
          {flash}
        </p>
      )}
      <Card tone="accent" className="mb-4">
        <p className="text-base leading-relaxed">{s.guide}</p>
        <p className="mt-2 text-base text-ink-muted">
          담당: {s.grades.map((g) => `${g}학년`).join(', ')} ·{' '}
          {s.postTypes.map((t) => POST_TYPE_LABEL[t] ?? t).join(', ')} · 오늘 {s.doneToday}/
          {s.dailyCap}건
        </p>
      </Card>

      {queue.isLoading && <Spinner className="text-primary-600" />}
      {queue.data && queue.data.length === 0 && (
        <EmptyState icon="🎉" title="검토할 글이 없어요" description="다 했어요! 고마워요." />
      )}
      {queue.data && queue.data.length > 0 && (
        <ul className="space-y-3">
          {queue.data.map((p) => (
            <li key={p.id}>
              <Link
                to={`/review/${p.id}`}
                className="block rounded-lg border border-line bg-surface p-4 shadow-card hover:bg-primary-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{p.authorGrade}학년 학생</span>
                  <Badge tone={p.type === 'article' ? 'primary' : 'neutral'}>
                    {POST_TYPE_LABEL[p.type] ?? p.type}
                  </Badge>
                  {p.weekKey && <span className="text-base text-ink-muted">{p.weekKey}</span>}
                  <span className="ml-auto text-base text-ink-muted">
                    {p.submittedAt
                      ? new Date(p.submittedAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-base text-ink-muted">
                  {p.type === 'article' ? p.title : p.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
