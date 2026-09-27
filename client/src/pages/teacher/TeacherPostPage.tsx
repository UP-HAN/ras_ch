import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { teacherCommentsApi } from '@/api/teacherComments';
import { teacherPostsApi } from '@/api/teacherPosts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ArticleDetail } from '@/components/post/ArticleDetail';
import { ReportDetail } from '@/components/post/ReportDetail';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { IMAGE_KIND_LABEL, POST_TYPE_LABEL } from '@/components/post/postLabels';

const STATUS_LABEL: Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger' }
> = {
  draft: { label: '임시 저장', tone: 'neutral' },
  pending: { label: '미검토', tone: 'info' },
  reviewed: { label: '1차 통과', tone: 'info' },
  flagged: { label: '보류 요청', tone: 'warn' },
  approved: { label: '게시됨', tone: 'success' },
  rejected: { label: '반려', tone: 'danger' },
  hidden: { label: '숨김', tone: 'warn' },
};

/**
 * 교사용 글 상세 (QA #2, #8): 리포트·기사 원문 + 댓글(숨김 포함, 실명).
 * 신고함에서 `#comment-{id}` 로 들어오면 그 댓글로 스크롤하고 강조한다.
 */
export function TeacherPostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { hash } = useLocation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['teacher', 'post', postId],
    queryFn: () => teacherPostsApi.get(postId),
    enabled: Number.isInteger(postId),
  });
  const comments = useQuery({
    queryKey: ['teacher', 'post', postId, 'comments'],
    queryFn: () => teacherPostsApi.comments(postId),
    enabled: Number.isInteger(postId),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['teacher', 'post', postId] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'posts'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'comments'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'reports'] });
  };
  const fail = (e: unknown) => setMsg(errorMessage(e));
  const hidePost = useMutation({
    mutationFn: () =>
      teacherPostsApi.hide(postId, window.prompt('숨기는 이유(학생에게 보여요)') ?? undefined),
    onSuccess: () => {
      setMsg('글을 숨겼어요.');
      refresh();
    },
    onError: fail,
  });
  const unhidePost = useMutation({
    mutationFn: () => teacherPostsApi.unhide(postId),
    onSuccess: () => {
      setMsg('글을 다시 보이게 했어요.');
      refresh();
    },
    onError: fail,
  });
  const hideComment = useMutation({
    mutationFn: (cid: number) =>
      teacherCommentsApi.hide(cid, window.prompt('숨기는 이유(학생에게 보여요)') ?? undefined),
    onSuccess: () => {
      setMsg('댓글을 숨겼어요.');
      refresh();
    },
    onError: fail,
  });
  const unhideComment = useMutation({
    mutationFn: (cid: number) => teacherCommentsApi.unhide(cid),
    onSuccess: () => {
      setMsg('댓글을 다시 보이게 했어요.');
      refresh();
    },
    onError: fail,
  });

  const focusId = hash.startsWith('#comment-') ? Number(hash.slice('#comment-'.length)) : null;
  useEffect(() => {
    if (!focusId || !comments.data) return;
    const el = document.getElementById(`comment-${focusId}`);
    el?.scrollIntoView({ block: 'center' });
  }, [focusId, comments.data]);

  if (q.isLoading) return <Spinner size="lg" className="text-accent-600" />;
  const post = q.data;
  if (!post)
    return (
      <EmptyState
        icon="🙈"
        title="이 글은 볼 수 없어요"
        description={errorMessage(q.error, '')}
        action={
          <Link to="/teacher/posts" className="underline">
            반 글 목록으로
          </Link>
        }
      />
    );
  const st = STATUS_LABEL[post.status] ?? STATUS_LABEL.pending!;
  const isArticle = post.type === 'article';
  const detailPost = { ...post, isMine: false };

  return (
    <>
      <PageHeader
        title={`${POST_TYPE_LABEL[post.type] ?? '글'} 상세`}
        description={`${post.author.className} ${post.author.studentNo ?? ''}번 ${post.author.name} · ${post.weekKey ?? fmtDateTime(post.createdAt, true)}`}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {post.status === 'approved' && (
              <Button
                variant="secondary"
                onClick={() => hidePost.mutate()}
                loading={hidePost.isPending}
              >
                숨기기
              </Button>
            )}
            {post.status === 'hidden' && (
              <Button
                variant="secondary"
                onClick={() => unhidePost.mutate()}
                loading={unhidePost.isPending}
              >
                다시 보이기
              </Button>
            )}
          </span>
        }
      />
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {post.rejectReason && (
        <p className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">
          반려 사유: {post.rejectReason}
        </p>
      )}
      {post.hiddenReason && (
        <p className="mb-3 rounded-md bg-warn-50 px-3 py-2 text-base text-warn-600">
          숨김 사유: {post.hiddenReason}
        </p>
      )}
      <div className="mb-2 text-base text-ink-muted">
        제출 {fmtDateTime(post.submittedAt, true)}
        {post.approvedAt ? ` · 승인 ${fmtDateTime(post.approvedAt, true)}` : ''} · 👍{' '}
        {post.likeCount} · 💬 {post.commentCount}
      </div>
      {isArticle ? <ArticleDetail post={detailPost} /> : <ReportDetail post={detailPost} />}
      {post.images.length > 0 && (
        <p className="mt-2 text-base text-ink-muted">
          이미지: {post.images.map((i) => IMAGE_KIND_LABEL[i.kind] ?? i.kind).join(', ')}
        </p>
      )}

      <Card title={`댓글 ${comments.data?.length ?? 0}개 (숨긴 댓글 포함)`} className="mt-4">
        {comments.isLoading && <Spinner className="text-accent-600" />}
        {comments.data && comments.data.length === 0 && (
          <p className="text-base text-ink-muted">아직 댓글이 없어요.</p>
        )}
        <ul className="divide-y divide-line">
          {comments.data?.map((c) => (
            <li
              key={c.id}
              id={`comment-${c.id}`}
              className={`flex flex-wrap items-start gap-2 py-2 text-base ${
                c.id === focusId ? 'rounded-md bg-warn-50 px-2 ring-2 ring-warn-600' : ''
              }`}
              data-testid={`teacher-comment-${c.id}`}
            >
              <span className="font-semibold">
                {c.author.className} {c.author.studentNo}번 {c.author.name}
              </span>
              <span className="text-ink-muted">{fmtDateTime(c.createdAt)}</span>
              {c.reportCount > 0 && <Badge tone="danger">신고 {c.reportCount}</Badge>}
              {c.bannedHits.length > 0 && (
                <Badge tone="warn">금칙어: {c.bannedHits.join(', ')}</Badge>
              )}
              {c.status === 'hidden' && <Badge tone="neutral">숨김</Badge>}
              <span
                className={`w-full ${c.status === 'hidden' ? 'text-ink-muted line-through' : ''}`}
              >
                {c.body}
              </span>
              {c.hiddenReason && (
                <span className="w-full text-ink-muted">숨김 사유: {c.hiddenReason}</span>
              )}
              <span className="ml-auto">
                {c.status === 'visible' ? (
                  <Button variant="ghost" onClick={() => hideComment.mutate(c.id)}>
                    숨김
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => unhideComment.mutate(c.id)}>
                    해제
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
