import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { teacherPostsApi } from '@/api/teacherPosts';
import { PageHeader } from '@/components/layout/PageHeader';
import { minutesLabel } from '@/components/post/UsageDiff';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useClassParam } from '@/hooks/useClassParam';
import { fmtDate } from '@/lib/format';
import { POST_TYPE_LABEL } from '@/components/post/postLabels';

const STATUS_TABS = [
  { key: 'approved', label: '게시됨' },
  { key: 'rejected', label: '반려' },
  { key: 'hidden', label: '숨김' },
  { key: 'all', label: '전체' },
];
const STATUS_LABEL: Record<string, string> = {
  draft: '임시',
  pending: '대기',
  reviewed: '1차 통과',
  flagged: '보류',
  approved: '게시',
  rejected: '반려',
  hidden: '숨김',
};

/**
 * 반 글 목록 (TCH-04 숨김·해제). 최신순, 유형 컬럼, 상세 링크, "더 보기" 페이지네이션 (QA #8, #10)
 */
export function ClassPostsPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const { selected, select } = useClassParam(classes.data);
  const [status, setStatus] = useState('approved');
  const posts = useInfiniteQuery({
    queryKey: ['teacher', 'posts', selected, status],
    queryFn: ({ pageParam }) =>
      teacherPostsApi.posts(selected as number, status, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: selected !== null,
  });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['teacher', 'posts'] });
  const hide = useMutation({
    mutationFn: (id: number) =>
      teacherPostsApi.hide(id, window.prompt('숨기는 이유(학생에게 보여요)') ?? undefined),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const unhide = useMutation({
    mutationFn: teacherPostsApi.unhide,
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];
  const total = posts.data?.pages[0]?.total ?? 0;

  return (
    <>
      <PageHeader
        title="반 글 목록"
        description="학생·제목을 누르면 글 전체와 댓글을 볼 수 있어요. 게시된 글은 숨기거나 다시 보이게 할 수 있어요."
      />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="반 선택">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            aria-pressed={c.id === selected}
            onClick={() => select(c.id)}
          >
            {c.name}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="상태">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.key}
            variant={status === t.key ? 'primary' : 'ghost'}
            aria-pressed={status === t.key}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </Button>
        ))}
        {posts.data && (
          <span className="ml-auto text-base text-ink-muted" data-testid="posts-total">
            {items.length}/{total}건
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-base text-danger-600">
          {error}
        </p>
      )}
      {posts.isLoading && <Spinner className="text-accent-600" />}
      {posts.data && items.length === 0 && <EmptyState icon="📄" title="글이 없어요" />}
      {posts.data && items.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="py-2 pr-3">학생</th>
                  <th className="py-2 pr-3">유형</th>
                  <th className="py-2 pr-3">주차·게시일</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">사용시간</th>
                  <th className="py-2 pr-3">공개</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold">
                      <Link
                        to={`/teacher/posts/${p.id}`}
                        className="inline-flex min-h-tap items-center underline"
                      >
                        {p.author.studentNo}번 {p.author.name}
                      </Link>
                      {p.type === 'article' && p.title && (
                        <Link
                          to={`/teacher/posts/${p.id}`}
                          className="flex min-h-tap max-w-xs items-center truncate font-normal text-ink-muted underline"
                        >
                          {p.title}
                        </Link>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        tone={
                          p.type === 'article' ? 'primary' : p.type === 'diary' ? 'neutral' : 'info'
                        }
                      >
                        {POST_TYPE_LABEL[p.type] ?? p.type}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.weekKey ?? fmtDate(p.approvedAt ?? p.submittedAt ?? p.createdAt)}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        tone={
                          p.status === 'approved'
                            ? 'success'
                            : p.status === 'rejected'
                              ? 'danger'
                              : p.status === 'hidden'
                                ? 'warn'
                                : 'info'
                        }
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      {p.report ? minutesLabel(p.report.avgMinutesPerDay) : '—'}
                    </td>
                    <td className="py-2 pr-3">{p.visibility === 'school' ? '전교' : '우리 반'}</td>
                    <td className="py-2">
                      {p.status === 'approved' && (
                        <Button variant="secondary" onClick={() => hide.mutate(p.id)}>
                          숨기기
                        </Button>
                      )}
                      {p.status === 'hidden' && (
                        <Button variant="secondary" onClick={() => unhide.mutate(p.id)}>
                          다시 보이기
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {posts.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                loading={posts.isFetchingNextPage}
                onClick={() => void posts.fetchNextPage()}
              >
                더 보기 ({total - items.length}건 남음)
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
