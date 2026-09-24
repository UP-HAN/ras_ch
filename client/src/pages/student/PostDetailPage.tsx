import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyPostView, StudentPostView } from '@server-types/api';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { postsApi } from '@/api/posts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ArticleDetail } from '@/components/post/ArticleDetail';
import { ReactionsSection } from '@/components/post/Reactions';
import { ReportDetail } from '@/components/post/ReportDetail';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useReadTracker } from '@/hooks/useReadTracker';

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

/** 글 상세 (RPT-07/08, ART-01, RCT-01~06, PT-10). 리포트/기사 분기, 좋아요·댓글·신고·읽기 추적 */
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
  const post = q.data as StudentPostView | MyPostView | undefined;
  const mine = post ? isMine(post) : false;
  const my = post && isMine(post) ? post : null;
  // 읽기 이벤트: 남의 승인된 글만 (서버도 다시 검사)
  useReadTracker(
    post && !mine && post.status === 'approved' ? { type: 'post', id: post.id } : null,
    true,
  );

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!post) {
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
  const status = STATUS[post.status] ?? STATUS.pending!;
  const isArticle = post.type === 'article';
  const editPath = isArticle ? `/posts/${post.id}/edit-article` : `/posts/${post.id}/edit`;

  const remove = async () => {
    if (!window.confirm('이 글을 지울까요? 받은 포인트도 함께 없어져요.')) return;
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
        title={
          isArticle
            ? 'RAS 기사'
            : post.type === 'diary'
              ? '폰 없는 일주일 일기'
              : '폰프리 주간 리포트'
        }
        action={mine ? <Badge tone={status.tone}>{status.label}</Badge> : undefined}
      />
      {my && my.status === 'rejected' && my.rejectReason && (
        <Card tone="primary" className="mb-4" title="선생님 말씀">
          <p className="text-base">{my.rejectReason}</p>
          <p className="mt-1 text-base text-ink-muted">고쳐서 다시 보내면 돼요.</p>
        </Card>
      )}
      {mine && post.status === 'hidden' && (
        <p className="mb-4 rounded-md bg-warn-50 px-3 py-2 text-base text-warn-600">
          {my?.hiddenReason ?? '선생님이 숨긴 글이에요.'}
        </p>
      )}

      {isArticle ? <ArticleDetail post={post} /> : <ReportDetail post={post} />}

      {post.status === 'approved' && (
        <div className="mt-4">
          <ReactionsSection target={{ type: 'post', id: post.id }} isMine={mine} />
        </div>
      )}

      {mine && (
        <div className="mt-4 space-y-2">
          {EDITABLE.includes(post.status) && (
            <Button block variant="secondary" onClick={() => navigate(editPath)}>
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
    </>
  );
}
