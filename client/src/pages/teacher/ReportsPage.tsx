import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReportItemView } from '@server-types/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { teacherCommentsApi } from '@/api/teacherComments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Spinner } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

const KIND_LABEL: Record<ReportItemView['targetKind'], string> = {
  post: '글',
  post_comment: '댓글',
  news_comment: '토론 의견',
  council_comment: '자치회 댓글',
};
const STATUS_LABEL: Record<ReportItemView['status'], string> = {
  open: '처리 전',
  kept: '유지',
  hidden: '숨김',
  deleted: '삭제',
};

/** 신고 대상 원문 링크 (QA #2): 글·글의 댓글은 교사용 글 상세, 토론 의견은 토론 주제 화면 */
function targetLink(r: ReportItemView): { to: string; label: string } | null {
  if (r.targetKind === 'post' && r.postId)
    return { to: `/teacher/posts/${r.postId}`, label: '글 보기' };
  if (r.targetKind === 'post_comment' && r.postId && r.commentId)
    return { to: `/teacher/posts/${r.postId}#comment-${r.commentId}`, label: '원글에서 댓글 보기' };
  if (r.targetKind === 'news_comment') return { to: '/teacher/news', label: '토론 주제 화면' };
  return null;
}

/** 신고함 (TCH-04, RCT-05): 신고 대상 단위로 카드 1장, 유지 / 숨김 / 삭제 (QA #4) */
export function ReportsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const q = useQuery({
    queryKey: ['teacher', 'reports', status],
    queryFn: () => teacherCommentsApi.reports(status),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ReportItemView | null>(null);
  const handle = useMutation({
    mutationFn: (v: { id: number; action: 'keep' | 'hide' | 'delete' }) =>
      teacherCommentsApi.handleReport(v.id, v.action),
    onSuccess: (_r, v) => {
      setDeleting(null);
      setMsg(
        v.action === 'keep'
          ? '유지했어요. 같은 대상의 신고를 모두 처리했어요.'
          : v.action === 'hide'
            ? '숨겼어요. 같은 대상의 신고를 모두 처리했어요.'
            : '삭제했어요. 같은 대상의 신고를 모두 처리했어요.',
      );
      void qc.invalidateQueries({ queryKey: ['teacher'] });
    },
    onError: (e) => {
      setDeleting(null);
      setMsg(errorMessage(e));
    },
  });

  return (
    <>
      <PageHeader
        title="신고함"
        description="학생들이 신고한 글·댓글을 확인하고 처리해요. 같은 글·댓글에 대한 신고는 한 장으로 모아 보여요. 3명이 신고하면 자동으로 숨겨져요."
      />
      <div className="mb-4 flex gap-2" role="group" aria-label="처리 상태">
        <Button
          variant={status === 'open' ? 'primary' : 'ghost'}
          aria-pressed={status === 'open'}
          onClick={() => setStatus('open')}
        >
          처리 전
        </Button>
        <Button
          variant={status === 'all' ? 'primary' : 'ghost'}
          aria-pressed={status === 'all'}
          onClick={() => setStatus('all')}
        >
          전체
        </Button>
      </div>
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && q.data.length === 0 && <EmptyState icon="🧹" title="신고가 없어요" />}
      <div className="space-y-3">
        {q.data?.map((r) => {
          const link = targetLink(r);
          return (
            <Card key={r.key} data-testid={`report-${r.targetType}-${r.targetId}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.targetType === 'post' ? 'primary' : 'info'}>
                  {KIND_LABEL[r.targetKind]}
                </Badge>
                <Badge tone={r.status === 'open' ? 'danger' : 'neutral'}>
                  {r.status === 'open' ? `신고 ${r.reportCount}건` : STATUS_LABEL[r.status]}
                </Badge>
                <span className="font-semibold">
                  {r.target.className} {r.target.authorName}
                </span>
                <span className="text-ink-muted">
                  {r.target.status === 'hidden' ? '(현재 숨김)' : ''}
                </span>
                <span className="ml-auto text-base text-ink-muted">
                  최근 신고 {fmtDateTime(r.latestAt)}
                </span>
              </div>
              <p className="mt-2 text-base">"{r.target.preview}"</p>
              <ul className="mt-2 space-y-1 rounded-md bg-paper px-3 py-2 text-base">
                {r.reports.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-2">
                    <span className="text-ink-muted">
                      {e.reporter.className} {e.reporter.displayName}
                    </span>
                    <span>{e.reason}</span>
                    <span className="ml-auto text-ink-muted">{fmtDateTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {link && (
                  <Link
                    to={link.to}
                    className="inline-flex min-h-tap items-center text-base underline"
                  >
                    {link.label}
                  </Link>
                )}
                {r.status === 'open' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => handle.mutate({ id: r.id, action: 'keep' })}
                      loading={handle.isPending && handle.variables?.id === r.id}
                    >
                      유지
                    </Button>
                    <Button
                      onClick={() => handle.mutate({ id: r.id, action: 'hide' })}
                      loading={handle.isPending && handle.variables?.id === r.id}
                    >
                      숨김
                    </Button>
                    <Button variant="danger" onClick={() => setDeleting(r)}>
                      삭제
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {deleting && (
        <ConfirmDialog
          title={`${KIND_LABEL[deleting.targetKind]} 삭제`}
          message={`${deleting.target.className} ${deleting.target.authorName} 학생의 ${KIND_LABEL[deleting.targetKind]}을(를) 삭제할까요? 받은 포인트도 회수되고 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          danger
          loading={handle.isPending}
          onConfirm={() => handle.mutate({ id: deleting.id, action: 'delete' })}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
