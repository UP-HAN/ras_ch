import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { teacherPostsApi } from '@/api/teacherPosts';
import { PageHeader } from '@/components/layout/PageHeader';
import { minutesLabel } from '@/components/post/UsageDiff';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

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

/** 반 글 목록 (TCH-04 숨김·해제). 삭제는 사유 기록 후 S3 신고함과 함께 */
export function ClassPostsPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const [status, setStatus] = useState('approved');
  const selected = classId ?? classes.data?.[0]?.id ?? null;
  const posts = useQuery({
    queryKey: ['teacher', 'posts', selected, status],
    queryFn: () => teacherPostsApi.posts(selected as number, status),
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

  return (
    <>
      <PageHeader title="반 글 목록" description="게시된 글을 숨기거나 다시 보이게 할 수 있어요." />
      <div className="mb-3 flex flex-wrap gap-2">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            onClick={() => setClassId(c.id)}
          >
            {c.name}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.key}
            variant={status === t.key ? 'primary' : 'ghost'}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-base text-danger-600">
          {error}
        </p>
      )}
      {posts.isLoading && <Spinner className="text-accent-600" />}
      {posts.data && posts.data.length === 0 && <EmptyState icon="📄" title="글이 없어요" />}
      {posts.data && posts.data.length > 0 && (
        <Card>
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-2 pr-3">학생</th>
                <th className="py-2 pr-3">주차</th>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2 pr-3">사용시간</th>
                <th className="py-2 pr-3">공개</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {posts.data.map((p) => (
                <tr key={p.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-semibold">
                    {p.author.studentNo}번 {p.author.name}
                  </td>
                  <td className="py-2 pr-3">{p.weekKey}</td>
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
                  <td className="py-2 pr-3">{minutesLabel(p.report?.avgMinutesPerDay ?? null)}</td>
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
        </Card>
      )}
    </>
  );
}
