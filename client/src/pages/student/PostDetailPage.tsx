import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyPostView, StudentPostView } from '@server-types/api';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { postsApi } from '@/api/posts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReportDetail } from '@/components/post/ReportDetail';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger' }
> = {
  draft: { label: '임시 저장', tone: 'neutral' },
  pending: { label: '선생님 확인 중', tone: 'info' },
  reviewed: { label: '선생님 확인 중', tone: 'info' },
  flagged: { label: '선생님 확인 중', tone: 'info' },
  approved: { label: '게시됨', tone: 'success' },
  rejected: { label: '다시 써 주세요', tone: 'danger' },
  hidden: { label: '숨김', tone: 'warn' },
};
const EDITABLE = ['draft', 'pending', 'reviewed', 'flagged', 'rejected'];

function isMine(p: StudentPostView | MyPostView): p is MyPostView {
  return p.isMine && 'rejectReason' in p;
}

/** 리포트 상세 (RPT-07, RPT-08). 본인 글이면 상태·반려 사유·수정·삭제 */
export function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['posts', postId],
    queryFn: () => postsApi.get(postId),
    enabled: Number.isInteger(postId),
  });
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!q.data) {
    return (
      <EmptyState
        icon="🙈"
        title="이 글은 볼 수 없어요"
        description={errorMessage(q.error, '')}
        action={
          <Link to="/" className="underline">
            홈으로
          </Link>
        }
      />
    );
  }
  const post = q.data as StudentPostView | MyPostView;
  const mine = isMine(post);
  const status = STATUS[post.status] ?? STATUS.pending!;

  const remove = async () => {
    if (!window.confirm('이 리포트를 지울까요? 받은 포인트도 함께 없어져요.')) return;
    try {
      await postsApi.remove(post.id);
      await qc.invalidateQueries({ queryKey: ['posts'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={post.type === 'diary' ? '폰 없는 일주일 일기' : '폰프리 주간 리포트'}
        action={mine ? <Badge tone={status.tone}>{status.label}</Badge> : undefined}
      />
      {mine && post.status === 'rejected' && post.rejectReason && (
        <Card tone="primary" className="mb-4" title="선생님 말씀">
          <p className="text-base">{post.rejectReason}</p>
          <p className="mt-1 text-base text-ink-muted">고쳐서 다시 보내면 돼요.</p>
        </Card>
      )}
      {mine && post.status === 'hidden' && (
        <p className="mb-4 rounded-md bg-warn-50 px-3 py-2 text-base text-warn-600">
          {post.hiddenReason ?? '선생님이 숨긴 글이에요.'}
        </p>
      )}

      <ReportDetail post={post} />

      {mine && (
        <div className="mt-4 space-y-2">
          {EDITABLE.includes(post.status) && (
            <Button block variant="secondary" onClick={() => navigate(`/posts/${post.id}/edit`)}>
              {post.status === 'rejected' ? '고쳐서 다시 보내기' : '고치기'}
            </Button>
          )}
          <Button block variant="ghost" onClick={remove}>
            지우기
          </Button>
          {error && (
            <p role="alert" className="text-base text-danger-600">
              {error}
            </p>
          )}
        </div>
      )}
      {!mine && (
        <Card className="mt-4">
          <p className="text-base text-ink-muted">👍 좋아요와 💬 댓글은 곧 열려요. (S3)</p>
        </Card>
      )}
    </>
  );
}
