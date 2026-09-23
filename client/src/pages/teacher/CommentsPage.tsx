import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { teacherCommentsApi, type CommentFlag, type CommentScope } from '@/api/teacherComments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useMe } from '@/hooks/useMe';

const NOTICES = [
  { code: 'kind', label: '좋은 댓글 안내' },
  { code: 'privacy', label: '개인정보 주의' },
  { code: 'spam', label: '반복 댓글 주의' },
] as const;

/** 댓글 모아보기 (TCH-06, 07): 범위·기간·필터, 오늘/미확인 수, 숨김·안내·확인 기록 */
export function CommentsPage() {
  const { me } = useMe();
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [scope, setScope] = useState<{ scope: CommentScope; id: string } | null>(null);
  const [flag, setFlag] = useState<CommentFlag>('all');
  const [since, setSince] = useState('');
  const q = useQuery({
    queryKey: ['teacher', 'comments', scope, flag, since],
    queryFn: () =>
      teacherCommentsApi.list({
        scope: scope?.scope,
        id: scope?.id,
        flag,
        since: since || undefined,
      }),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['teacher', 'comments'] });
  const onErr = (e: unknown) => setMsg(errorMessage(e));
  const hide = useMutation({
    mutationFn: (id: number) =>
      teacherCommentsApi.hide(id, window.prompt('숨기는 이유(학생에게 보여요)') ?? undefined),
    onSuccess: () => {
      setMsg('댓글을 숨겼어요.');
      refresh();
    },
    onError: onErr,
  });
  const unhide = useMutation({
    mutationFn: (id: number) => teacherCommentsApi.unhide(id),
    onSuccess: refresh,
    onError: onErr,
  });
  const notifyM = useMutation({
    mutationFn: (v: { id: number; code: (typeof NOTICES)[number]['code'] }) =>
      teacherCommentsApi.notify(v.id, v.code),
    onSuccess: () => setMsg('안내를 보냈어요.'),
    onError: onErr,
  });
  const checked = useMutation({
    mutationFn: () => teacherCommentsApi.checked(q.data?.scope ?? 'class', q.data?.scopeId ?? ''),
    onSuccess: () => {
      setMsg('확인 시각을 기록했어요.');
      refresh();
    },
    onError: onErr,
  });

  const groups: Array<{ scope: CommentScope; id: string; label: string }> = [];
  if (me?.role === 'admin' || me?.isApprover || me?.advisorGradeGroup === '3-4')
    groups.push({ scope: 'group', id: '3-4', label: '3-4학년군' });
  if (me?.role === 'admin' || me?.isApprover || me?.advisorGradeGroup === '5-6')
    groups.push({ scope: 'group', id: '5-6', label: '5-6학년군' });

  return (
    <>
      <PageHeader
        title="댓글 모아보기"
        description="반 학생들이 쓴 댓글을 최신순으로 훑어보고, 필요하면 숨기거나 안내를 보내요."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {groups.map((g) => (
          <Button
            key={g.id}
            variant={scope?.scope === 'group' && scope.id === g.id ? 'primary' : 'secondary'}
            onClick={() => setScope({ scope: 'group', id: g.id })}
          >
            {g.label}
          </Button>
        ))}
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={
              scope?.scope === 'class' && scope.id === String(c.id) ? 'primary' : 'secondary'
            }
            onClick={() => setScope({ scope: 'class', id: String(c.id) })}
          >
            {c.name}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'reported', 'banned'] as CommentFlag[]).map((f) => (
          <Button key={f} variant={flag === f ? 'primary' : 'ghost'} onClick={() => setFlag(f)}>
            {f === 'all' ? '전체' : f === 'reported' ? '신고됨' : '금칙어 근접'}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-base">
          이 날짜부터
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
          />
        </label>
      </div>

      {q.data && (
        <Card className="mb-4" tone="accent">
          <div className="flex flex-wrap items-center gap-3 text-base">
            <span>
              오늘 새 댓글 <strong className="text-xl">{q.data.counts.today}</strong>건
            </span>
            <span>
              미확인 <strong className="text-xl text-warn-600">{q.data.counts.unchecked}</strong>건
            </span>
            <span className="text-ink-muted">
              {q.data.counts.lastCheckedAt
                ? `마지막 확인: ${q.data.counts.lastCheckedBy} · ${new Date(q.data.counts.lastCheckedAt).toLocaleString('ko-KR')}`
                : '아직 확인 기록이 없어요'}
            </span>
            <Button
              className="ml-auto"
              loading={checked.isPending}
              onClick={() => checked.mutate()}
            >
              여기까지 확인했어요
            </Button>
          </div>
        </Card>
      )}
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && q.data.items.length === 0 && <EmptyState icon="💬" title="댓글이 없어요" />}
      {q.data && q.data.items.length > 0 && (
        <Card>
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-2 pr-3">시각</th>
                <th className="py-2 pr-3">학생</th>
                <th className="py-2 pr-3">댓글</th>
                <th className="py-2 pr-3">글</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((c) => (
                <tr
                  key={c.id}
                  className={
                    c.status === 'hidden'
                      ? 'border-b border-line/60 bg-warn-50/50'
                      : 'border-b border-line/60'
                  }
                >
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-muted">
                    {new Date(c.createdAt).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap font-semibold">
                    {c.author.className} {c.author.studentNo}번 {c.author.name}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={c.status === 'hidden' ? 'line-through text-ink-muted' : ''}>
                      {c.body}
                    </span>
                    <span className="ml-1 inline-flex gap-1">
                      {c.reportCount > 0 && <Badge tone="danger">신고 {c.reportCount}</Badge>}
                      {c.bannedHits.length > 0 && (
                        <Badge tone="warn">금칙어: {c.bannedHits.join(', ')}</Badge>
                      )}
                      {c.status === 'hidden' && <Badge tone="neutral">숨김</Badge>}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {c.target.postType === 'article' ? '기사' : '리포트'} · {c.target.title ?? ''} (
                    {c.target.authorDisplayName})
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.status === 'visible' ? (
                        <Button variant="secondary" onClick={() => hide.mutate(c.id)}>
                          숨김
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={() => unhide.mutate(c.id)}>
                          해제
                        </Button>
                      )}
                      <select
                        aria-label="정형 안내 보내기"
                        className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                        value=""
                        onChange={(e) => {
                          const code = e.target.value as (typeof NOTICES)[number]['code'] | '';
                          if (code) notifyM.mutate({ id: c.id, code });
                        }}
                      >
                        <option value="">안내 보내기…</option>
                        {NOTICES.map((n) => (
                          <option key={n.code} value={n.code}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </div>
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
