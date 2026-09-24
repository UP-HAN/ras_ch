import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NewsAdminTopicView,
  NewsBankItemView,
  NewsProposalInput,
  NewsTeacherTopicView,
} from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { newsAdminApi } from '@/api/newsAdmin';
import { PageHeader } from '@/components/layout/PageHeader';
import { TOPIC_TYPE_LABEL } from '@/components/news/topicLabels';
import { VoteBar } from '@/components/news/VoteBar';
import { Badge, Button, Card, EmptyState, Input, Spinner, Textarea } from '@/components/ui';
import { useMe } from '@/hooks/useMe';

const TAGS = ['RAS', '폰프리', '미디어', '학교생활', '환경', '과학', '기타'];
const STATUS_LABEL: Record<
  string,
  { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' | 'warn' }
> = {
  scheduled: { label: '예약', tone: 'info' },
  live: { label: '진행 중', tone: 'success' },
  closed: { label: '마감', tone: 'neutral' },
  rejected: { label: '취소', tone: 'danger' },
  candidate: { label: '후보', tone: 'warn' },
  approved: { label: '승인', tone: 'warn' },
};
const BANK_LABEL: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warn' }> =
  {
    ready: { label: '바로 사용', tone: 'success' },
    reserve: { label: '대기', tone: 'info' },
    pending: { label: '임원 제안', tone: 'warn' },
    used: { label: '사용됨', tone: 'neutral' },
  };
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      })
    : '';
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------- 베스트 의견 (교사 전체, NWS-09) ----------
function BestSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['news', 'teacher', 'closed'],
    queryFn: newsAdminApi.closedForTeacher,
  });
  const [picked, setPicked] = useState<Record<number, Set<number>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { topicId: number; ids: number[] }) =>
      newsAdminApi.selectBest(v.topicId, v.ids),
    onSuccess: (r) => {
      setMsg(`저장했어요. 새로 뽑음 ${r.added}, 해제 ${r.removed}`);
      setPicked((p) => ({
        ...p,
        [r.topic.id]: new Set(
          r.topic.grades.flatMap((g) => g.comments.filter((c) => c.isBest).map((c) => c.id)),
        ),
      }));
      void qc.invalidateQueries({ queryKey: ['news'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const current = (t: NewsTeacherTopicView) =>
    picked[t.id] ??
    new Set(t.grades.flatMap((g) => g.comments.filter((c) => c.isBest).map((c) => c.id)));
  const toggle = (t: NewsTeacherTopicView, id: number) =>
    setPicked((p) => {
      const n = new Set(current(t));
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...p, [t.id]: n };
    });

  return (
    <Card title="마감된 토론 · 베스트 의견 뽑기">
      <p className="mb-3 text-base text-ink-muted">
        학년별로 정해진 수까지 뽑을 수 있어요. 뽑힌 학생은 BEST_OPINION 10P와 알림을 받아요. 담임은
        담당 반 학생만 고를 수 있어요.
      </p>
      {msg && (
        <p className="mb-2 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {error}
        </p>
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && q.data.length === 0 && <EmptyState icon="💬" title="아직 마감된 토론이 없어요" />}
      <div className="space-y-4">
        {q.data?.map((t) => {
          const sel = current(t);
          return (
            <div
              key={t.id}
              className="rounded-md border border-line p-3"
              data-testid={`closed-topic-${t.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={t.type === 'vote' ? 'primary' : 'info'}>
                  {TOPIC_TYPE_LABEL[t.type]}
                </Badge>
                <span className="text-lg font-bold">{t.title}</span>
                <span className="ml-auto text-base text-ink-muted">마감 {fmt(t.closeAt)}</span>
              </div>
              {t.type === 'vote' && (
                <div className="my-2 max-w-md">
                  <VoteBar votes={t.votes} compact />
                </div>
              )}
              {t.grades.length === 0 && <p className="text-base text-ink-muted">의견이 없어요.</p>}
              {t.grades.map((g) => (
                <div key={g.grade} className="mt-2">
                  <p className="text-base font-semibold">
                    {g.grade}학년 · 뽑음 {g.comments.filter((c) => sel.has(c.id)).length}/
                    {t.bestPerGrade}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.comments.map((c) => (
                      <li
                        key={c.id}
                        className={`flex items-start gap-2 rounded-md px-2 py-1 text-base ${sel.has(c.id) ? 'bg-primary-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          disabled={!c.canSelect}
                          checked={sel.has(c.id)}
                          onChange={() => toggle(t, c.id)}
                          aria-label={`${c.authorName} 의견 베스트로`}
                        />
                        <span>
                          <span className="font-semibold">
                            {c.className} {c.studentNo}번 {c.authorName}
                          </span>
                          {c.stance && (
                            <Badge
                              tone={c.stance === 'agree' ? 'success' : 'danger'}
                              className="ml-1"
                            >
                              {c.stance === 'agree' ? '찬성' : '반대'}
                            </Badge>
                          )}
                          <span className="ml-2 text-ink-muted">👍 {c.likeCount}</span>
                          {c.isBest && (
                            <Badge tone="primary" className="ml-1">
                              베스트
                            </Badge>
                          )}
                          <span className="block">{c.body}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {t.grades.length > 0 && (
                <Button
                  className="mt-3"
                  loading={save.isPending && save.variables?.topicId === t.id}
                  onClick={() => save.mutate({ topicId: t.id, ids: [...sel] })}
                >
                  베스트 의견 저장
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- 주제 입력 폼 (직접 작성·은행 편집) ----------
function TopicForm({
  initial,
  withPublishAt,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Partial<NewsProposalInput & { publishAt: string }>;
  withPublishAt: boolean;
  submitLabel: string;
  onSubmit: (v: NewsProposalInput & { publishAt?: string }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<NewsProposalInput & { publishAt: string }>(() => ({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    type: initial?.type ?? 'vote',
    questions: initial?.questions?.length ? initial.questions : ['', ''],
    tags: initial?.tags ?? [],
    sourceUrl: initial?.sourceUrl ?? '',
    publishAt: initial?.publishAt ?? toLocalInput(new Date(Date.now() + 86400000)),
  }));
  return (
    <div className="rounded-md border border-line p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-2 md:col-span-2">
          {(['vote', 'open'] as const).map((t) => (
            <Button
              key={t}
              variant={form.type === t ? 'primary' : 'secondary'}
              onClick={() => setForm((f) => ({ ...f, type: t }))}
            >
              {TOPIC_TYPE_LABEL[t]}
            </Button>
          ))}
        </div>
        <Input
          label="제목 (40자)"
          value={form.title}
          maxLength={40}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="md:col-span-2"
        />
        <Textarea
          label="쉬운 설명 (80~400자)"
          value={form.body}
          rows={4}
          maxLength={400}
          hint={`${Array.from(form.body).length}자`}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          className="md:col-span-2"
        />
        {form.questions.map((qv, i) => (
          <Input
            key={i}
            label={`생각 열기 질문 ${i + 1}`}
            value={qv}
            maxLength={100}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                questions: f.questions.map((x, j) => (j === i ? e.target.value : x)),
              }))
            }
          />
        ))}
        <Input
          label="출처 링크 (선택)"
          value={form.sourceUrl ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
        />
        {withPublishAt && (
          <Input
            label="게시 시각"
            type="datetime-local"
            value={form.publishAt}
            onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
          />
        )}
        <div className="md:col-span-2">
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
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          loading={busy}
          onClick={() =>
            onSubmit({
              ...form,
              questions: form.questions.filter((x) => x.trim()),
              publishAt: withPublishAt ? form.publishAt : undefined,
            })
          }
        >
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}

// ---------- approver: 예약·진행·설정·은행 ----------
function ScheduleSection() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['news', 'admin', 'settings'],
    queryFn: newsAdminApi.settings,
  });
  const topics = useQuery({
    queryKey: ['news', 'admin', 'topics'],
    queryFn: () => newsAdminApi.topics(),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NewsAdminTopicView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['news'] });
  const fail = (e: unknown) => setError(errorMessage(e));
  const create = useMutation({
    mutationFn: (v: NewsProposalInput & { publishAt?: string }) =>
      newsAdminApi.createTopic({ ...v, publishAt: v.publishAt ?? '' }),
    onSuccess: () => {
      setCreating(false);
      setMsg('예약했어요.');
      refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; input: NewsProposalInput & { publishAt?: string } }) =>
      newsAdminApi.updateTopic(v.id, v.input),
    onSuccess: () => {
      setEditing(null);
      setMsg('고쳤어요.');
      refresh();
    },
    onError: fail,
  });
  const act = useMutation({
    mutationFn: async (v: { id: number; what: 'cancel' | 'publish' | 'close' }) => {
      if (v.what === 'cancel') await newsAdminApi.cancelTopic(v.id);
      else if (v.what === 'publish') await newsAdminApi.publishNow(v.id);
      else await newsAdminApi.closeNow(v.id);
    },
    onSuccess: () => {
      setMsg('처리했어요.');
      refresh();
    },
    onError: fail,
  });
  const saveSettings = useMutation({
    mutationFn: (v: { perWeek?: number; hour?: number }) => newsAdminApi.updateSettings(v),
    onSuccess: () => {
      setMsg('설정을 저장했어요.');
      refresh();
    },
    onError: fail,
  });
  const runJob = useMutation({
    mutationFn: (job: 'reserve' | 'publish') => newsAdminApi.runJob(job),
    onSuccess: (r, job) => {
      setMsg(`${job === 'reserve' ? '자동 예약' : '게시·마감'} 실행: ${JSON.stringify(r)}`);
      refresh();
    },
    onError: fail,
  });

  const s = settings.data;
  return (
    <Card title="게시 일정 (승인 권한 교사)">
      {msg && (
        <p className="mb-2 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {error}
        </p>
      )}
      {s && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md bg-paper p-3">
          <label className="text-base">
            <span className="mb-1 block font-semibold">주당 게시 수</span>
            <select
              className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
              value={s.perWeek}
              onChange={(e) => saveSettings.mutate({ perWeek: Number(e.target.value) })}
              data-testid="per-week"
            >
              <option value={1}>1개 (수요일)</option>
              <option value={2}>2개 (월·수)</option>
              <option value={3}>3개 (월·수·금)</option>
            </select>
          </label>
          <span className="text-base text-ink-muted">
            {s.hour}시 게시 · {s.durationDays}일 후 마감 · 베스트 학년별 {s.bestPerGrade}개 · 은행:
            바로 사용 {s.bank.ready} / 대기 {s.bank.reserve} / 제안 {s.bank.pending}
          </span>
          <span className="ml-auto flex gap-1">
            <Button
              variant="secondary"
              loading={runJob.isPending && runJob.variables === 'reserve'}
              onClick={() => runJob.mutate('reserve')}
            >
              다음 주 자동 예약 지금 실행
            </Button>
            <Button
              variant="secondary"
              loading={runJob.isPending && runJob.variables === 'publish'}
              onClick={() => runJob.mutate('publish')}
            >
              게시·마감 지금 실행
            </Button>
          </span>
          <div className="w-full text-base">
            다음 주:{' '}
            {s.nextWeek.map((n) => (
              <Badge key={n.publishAt} tone={n.topicId ? 'success' : 'warn'} className="mr-1">
                {fmt(n.publishAt)} {n.title ?? '(비어 있음 — 일요일 20:00 자동 예약)'}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="mb-3 flex justify-end">
        {!creating && (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            주제 직접 작성·예약
          </Button>
        )}
      </div>
      {creating && (
        <TopicForm
          withPublishAt
          submitLabel="예약"
          busy={create.isPending}
          onSubmit={(v) => create.mutate(v)}
          onCancel={() => setCreating(false)}
        />
      )}
      {topics.isLoading && <Spinner className="text-accent-600" />}
      <ul className="mt-3 divide-y divide-line">
        {topics.data?.map((t) => (
          <li key={t.id} className="py-2" data-testid={`admin-topic-${t.id}`}>
            {editing?.id === t.id ? (
              <TopicForm
                initial={{
                  ...t,
                  publishAt: t.publishAt ? toLocalInput(new Date(t.publishAt)) : undefined,
                }}
                withPublishAt
                submitLabel="저장"
                busy={update.isPending}
                onSubmit={(v) => update.mutate({ id: t.id, input: v })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-base">
                <Badge tone={STATUS_LABEL[t.status]?.tone ?? 'neutral'}>
                  {STATUS_LABEL[t.status]?.label ?? t.status}
                </Badge>
                <span className="text-ink-muted">{fmt(t.publishAt)}</span>
                <span className="font-semibold">{t.title}</span>
                <span className="text-ink-muted">
                  {TOPIC_TYPE_LABEL[t.type]} · {t.source === 'bank' ? '은행' : '직접'}
                </span>
                {t.type === 'vote' && t.status !== 'scheduled' && (
                  <span className="text-ink-muted">
                    찬 {t.votes.agree} / 반 {t.votes.disagree}
                  </span>
                )}
                <span className="text-ink-muted">💬 {t.commentCount}</span>
                <span className="ml-auto flex gap-1">
                  {t.status === 'scheduled' && (
                    <>
                      <Button variant="secondary" onClick={() => setEditing(t)}>
                        수정
                      </Button>
                      <Button onClick={() => act.mutate({ id: t.id, what: 'publish' })}>
                        지금 게시
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          window.confirm('예약을 취소할까요?') &&
                          act.mutate({ id: t.id, what: 'cancel' })
                        }
                      >
                        취소
                      </Button>
                    </>
                  )}
                  {t.status === 'live' && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        window.confirm('지금 마감할까요? 투표·의견이 잠겨요.') &&
                        act.mutate({ id: t.id, what: 'close' })
                      }
                    >
                      지금 마감
                    </Button>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
        {topics.data?.length === 0 && (
          <li className="py-2 text-base text-ink-muted">
            최근 4주~앞으로 3주 사이에 주제가 없어요.
          </li>
        )}
      </ul>
    </Card>
  );
}

function BankSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['news', 'admin', 'bank'], queryFn: newsAdminApi.bank });
  const [filter, setFilter] = useState<'all' | 'ready' | 'reserve' | 'pending' | 'used'>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NewsBankItemView | null>(null);
  const [scheduling, setScheduling] = useState<{ id: number; at: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['news'] });
  const fail = (e: unknown) => setError(errorMessage(e));
  const create = useMutation({
    mutationFn: (v: NewsProposalInput) => newsAdminApi.createBank(v),
    onSuccess: () => {
      setCreating(false);
      refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; input: NewsProposalInput }) =>
      newsAdminApi.updateBank(v.id, v.input),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: 'ready' | 'reserve' }) =>
      newsAdminApi.setBankStatus(v.id, v.status),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: number) => newsAdminApi.deleteBank(id),
    onSuccess: refresh,
    onError: fail,
  });
  const schedule = useMutation({
    mutationFn: (v: { id: number; at: string }) => newsAdminApi.scheduleBank(v.id, v.at),
    onSuccess: () => {
      setScheduling(null);
      setMsg('예약했어요.');
      refresh();
    },
    onError: fail,
  });
  const items = (q.data ?? []).filter((b) => filter === 'all' || b.status === filter);

  return (
    <Card title="주제 은행">
      <p className="mb-3 text-base text-ink-muted">
        "바로 사용" 주제가 자동 예약에 쓰여요(오래된 순). 2개 이하로 줄면 알림이 와요. 대기 주제를
        하나씩 올려 주세요.
      </p>
      {msg && (
        <p className="mb-2 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {error}
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'pending', 'ready', 'reserve', 'used'] as const).map((f) => (
          <Button key={f} variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
            {f === 'all' ? '전체' : BANK_LABEL[f]?.label}{' '}
            {f === 'all'
              ? (q.data?.length ?? 0)
              : (q.data?.filter((b) => b.status === f).length ?? 0)}
          </Button>
        ))}
        {!creating && (
          <Button className="ml-auto" variant="secondary" onClick={() => setCreating(true)}>
            새 주제 추가
          </Button>
        )}
      </div>
      {creating && (
        <TopicForm
          withPublishAt={false}
          submitLabel="은행에 추가(대기)"
          busy={create.isPending}
          onSubmit={(v) => create.mutate(v)}
          onCancel={() => setCreating(false)}
        />
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      <ul className="divide-y divide-line">
        {items.map((b) => (
          <li key={b.id} className="py-2" data-testid={`bank-${b.id}`}>
            {editing?.id === b.id ? (
              <TopicForm
                initial={b}
                withPublishAt={false}
                submitLabel="저장"
                busy={update.isPending}
                onSubmit={(v) => update.mutate({ id: b.id, input: v })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-base">
                <Badge tone={BANK_LABEL[b.status]?.tone ?? 'neutral'}>
                  {BANK_LABEL[b.status]?.label}
                </Badge>
                <Badge tone={b.type === 'vote' ? 'primary' : 'info'}>
                  {TOPIC_TYPE_LABEL[b.type]}
                </Badge>
                <span className="font-semibold">{b.title}</span>
                <span className="text-ink-muted">{b.tags.map((t) => `#${t}`).join(' ')}</span>
                {b.proposedByName && (
                  <span className="text-ink-muted">제안: {b.proposedByName}</span>
                )}
                <span className="ml-auto flex flex-wrap gap-1">
                  {b.status !== 'used' && (
                    <>
                      {b.status !== 'ready' && (
                        <Button onClick={() => setStatus.mutate({ id: b.id, status: 'ready' })}>
                          바로 사용으로
                        </Button>
                      )}
                      {b.status === 'ready' && (
                        <Button
                          variant="secondary"
                          onClick={() => setStatus.mutate({ id: b.id, status: 'reserve' })}
                        >
                          대기로
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setScheduling({
                            id: b.id,
                            at: toLocalInput(new Date(Date.now() + 86400000)),
                          })
                        }
                      >
                        날짜 정해 예약
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(b)}>
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => window.confirm('이 주제를 지울까요?') && remove.mutate(b.id)}
                      >
                        삭제
                      </Button>
                    </>
                  )}
                </span>
                {scheduling?.id === b.id && (
                  <span className="flex w-full items-end gap-2">
                    <Input
                      label="게시 시각"
                      type="datetime-local"
                      className="w-56"
                      value={scheduling.at}
                      onChange={(e) => setScheduling({ id: b.id, at: e.target.value })}
                    />
                    <Button
                      loading={schedule.isPending}
                      onClick={() => schedule.mutate(scheduling)}
                    >
                      예약
                    </Button>
                    <Button variant="ghost" onClick={() => setScheduling(null)}>
                      취소
                    </Button>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 토론 주제 (교사: 베스트 의견 / 승인 권한: 예약·은행·설정) */
export function NewsPage() {
  const { me } = useMe();
  const approver = !!me && (me.role === 'admin' || me.isApprover);
  return (
    <>
      <PageHeader
        title="토론 주제"
        description="마감된 토론의 베스트 의견을 뽑고, 다음 주제 게시를 관리해요."
      />
      <div className="space-y-4">
        <BestSection />
        {approver && <ScheduleSection />}
        {approver && <BankSection />}
      </div>
    </>
  );
}
