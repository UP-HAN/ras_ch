import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { teacherCommentsApi } from '@/api/teacherComments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

/** 신고함 (TCH-04, RCT-05): 유지 / 숨김 / 삭제 */
export function ReportsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const q = useQuery({
    queryKey: ['teacher', 'reports', status],
    queryFn: () => teacherCommentsApi.reports(status),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const handle = useMutation({
    mutationFn: (v: { id: number; action: 'keep' | 'hide' | 'delete' }) =>
      teacherCommentsApi.handleReport(v.id, v.action),
    onSuccess: (_r, v) => {
      setMsg(
        v.action === 'keep' ? '유지했어요.' : v.action === 'hide' ? '숨겼어요.' : '삭제했어요.',
      );
      void qc.invalidateQueries({ queryKey: ['teacher'] });
    },
    onError: (e) => setMsg(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="신고함"
        description="학생들이 신고한 글·댓글을 확인하고 처리해요. 3명이 신고하면 자동으로 숨겨져요."
      />
      <div className="mb-4 flex gap-2">
        <Button variant={status === 'open' ? 'primary' : 'ghost'} onClick={() => setStatus('open')}>
          처리 전
        </Button>
        <Button variant={status === 'all' ? 'primary' : 'ghost'} onClick={() => setStatus('all')}>
          전체
        </Button>
      </div>
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && q.data.length === 0 && <EmptyState icon="🧹" title="신고가 없어요" />}
      <div className="space-y-3">
        {q.data?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.targetType === 'post' ? 'primary' : 'info'}>
                {r.targetType === 'post' ? '글' : '댓글'}
              </Badge>
              <Badge tone={r.status === 'open' ? 'danger' : 'neutral'}>
                {r.status === 'open'
                  ? `신고 ${r.reportCount}건`
                  : r.status === 'kept'
                    ? '유지'
                    : r.status === 'hidden'
                      ? '숨김'
                      : '삭제'}
              </Badge>
              <span className="font-semibold">
                {r.target.className} {r.target.authorName}
              </span>
              <span className="text-ink-muted">
                {r.target.status === 'hidden' ? '(현재 숨김)' : ''}
              </span>
              <span className="ml-auto text-base text-ink-muted">
                {new Date(r.createdAt).toLocaleString('ko-KR')}
              </span>
            </div>
            <p className="mt-2 text-base">"{r.target.preview}"</p>
            <p className="mt-1 text-base text-ink-muted">
              신고 이유: {r.reason} — {r.reporter.className} {r.reporter.displayName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.postId && (
                <Link
                  to={`/posts/${r.postId}`}
                  className="inline-flex min-h-tap items-center text-base underline"
                >
                  글 보기
                </Link>
              )}
              {r.status === 'open' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handle.mutate({ id: r.id, action: 'keep' })}
                  >
                    유지
                  </Button>
                  <Button onClick={() => handle.mutate({ id: r.id, action: 'hide' })}>숨김</Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      window.confirm('정말 삭제할까요?') &&
                      handle.mutate({ id: r.id, action: 'delete' })
                    }
                  >
                    삭제
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
