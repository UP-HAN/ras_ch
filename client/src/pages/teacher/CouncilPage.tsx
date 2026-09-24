import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CouncilAdminPostView } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { councilAdminApi } from '@/api/councilAdmin';
import { teacherApi } from '@/api/teacher';
import { COUNCIL_STATUS, COUNCIL_TYPE } from '@/components/council/councilLabels';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Input, Spinner } from '@/components/ui';

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ---------- 임원 지정·해제 ----------
function MembersSection() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['council', 'members'], queryFn: councilAdminApi.members });
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const selectedClass = classId ?? classes.data?.[0]?.id ?? null;
  const students = useQuery({
    queryKey: ['teacher', 'students', selectedClass],
    queryFn: () => teacherApi.students(selectedClass as number),
    enabled: selectedClass !== null,
  });
  const [userId, setUserId] = useState<number | null>(null);
  const [title, setTitle] = useState('임원');
  const [termStart, setTermStart] = useState(today);
  const [termEnd, setTermEnd] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['council', 'members'] });
  };
  const add = useMutation({
    mutationFn: () =>
      councilAdminApi.addMember({
        userId: userId as number,
        title,
        termStart,
        termEnd: termEnd || null,
      }),
    onSuccess: (m) => {
      setMsg(`${m.className} ${m.name} 학생을 ${m.title}(으)로 지정했어요.`);
      setError(null);
      setUserId(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => councilAdminApi.removeMember(id),
    onSuccess: () => {
      setMsg('임원을 해제했어요.');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const active = members.data?.filter((m) => m.isActive) ?? [];
  const past = members.data?.filter((m) => !m.isActive) ?? [];
  return (
    <Card title="자치회 임원" data-testid="council-members">
      {members.isLoading && <Spinner className="text-accent-600" />}
      {active.length === 0 && !members.isLoading && (
        <p className="mb-3 text-base text-ink-muted">아직 지정된 임원이 없어요.</p>
      )}
      <ul className="mb-4 space-y-1">
        {active.map((m) => (
          <li
            key={m.id}
            className="flex min-h-tap flex-wrap items-center gap-2 rounded-md bg-paper px-3 text-base"
          >
            <Badge tone="info">{m.title}</Badge>
            <span className="font-semibold">
              {m.className} {m.studentNo}번 {m.name}
            </span>
            <span className="text-ink-muted">
              {m.termStart} ~ {m.termEnd ?? '미정'}
            </span>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => window.confirm(`${m.name} 임원을 해제할까요?`) && remove.mutate(m.id)}
            >
              해제
            </Button>
          </li>
        ))}
      </ul>
      <p className="mb-2 text-base font-semibold">임원 지정</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-base">
          <span className="mb-1 block font-semibold">반</span>
          <select
            className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
            value={selectedClass ?? ''}
            onChange={(e) => {
              setClassId(Number(e.target.value));
              setUserId(null);
            }}
          >
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-base">
          <span className="mb-1 block font-semibold">학생</span>
          <select
            className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
            value={userId ?? ''}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">고르세요</option>
            {students.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentNo}번 {s.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="직책"
          className="w-32"
          value={title}
          maxLength={20}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="임기 시작"
          type="date"
          className="w-44"
          value={termStart}
          onChange={(e) => setTermStart(e.target.value)}
        />
        <Input
          label="임기 끝 (선택)"
          type="date"
          className="w-44"
          value={termEnd}
          onChange={(e) => setTermEnd(e.target.value)}
        />
        <Button
          disabled={userId === null || !title.trim()}
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          지정
        </Button>
      </div>
      {msg && <p className="mt-2 text-base text-success-600">{msg}</p>}
      {error && (
        <p role="alert" className="mt-2 text-base text-danger-600">
          {error}
        </p>
      )}
      {past.length > 0 && (
        <details className="mt-3 text-base text-ink-muted">
          <summary className="min-h-tap cursor-pointer">지난 임원 {past.length}명</summary>
          <ul className="mt-1 space-y-1">
            {past.map((m) => (
              <li key={m.id}>
                {m.className} {m.name} · {m.title} · {m.termStart} ~ {m.termEnd}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// ---------- 글 관리 ----------
function PostRow({ p, onChanged }: { p: CouncilAdminPostView; onChanged: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(p.pinRequested);
  const [startsAt, setStartsAt] = useState(toLocal(p.startsAt));
  const [endsAt, setEndsAt] = useState(toLocal(p.endsAt));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (fn: () => Promise<CouncilAdminPostView>) => fn(),
    onSuccess: () => onChanged('처리했어요.'),
    onError: (e) => setError(errorMessage(e)),
  });
  const t = COUNCIL_TYPE[p.type];
  const st = COUNCIL_STATUS[p.status];
  return (
    <li
      className="rounded-md border border-line bg-paper p-3"
      data-testid={`council-admin-${p.id}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-base">
        <Badge tone={p.type === 'poll' ? 'primary' : 'info'}>
          {t.emoji} {t.label}
        </Badge>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
        {p.isPinned && <Badge tone="warn">📌 고정</Badge>}
        {p.pinRequested && p.status === 'pending' && <Badge tone="neutral">고정 요청</Badge>}
        <span className="font-bold">{p.title}</span>
        <span className="text-ink-muted">
          {p.authorClassName} {p.authorName}
          {p.submittedAt ? ` · 제출 ${fmt(p.submittedAt)}` : ''}
        </span>
        <Button variant="ghost" className="ml-auto" onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '내용 보기'}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap text-base">{p.body}</p>
          {p.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.images.map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  className="h-28 w-28 rounded-md object-cover"
                />
              ))}
            </div>
          )}
          {p.poll && (
            <ul className="text-base">
              {p.poll.options.map((o) => (
                <li key={o.id}>
                  🗳️ {o.label}
                  {o.votes !== null ? ` — ${o.votes}표` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="text-base text-ink-muted">
            게시 기간 {fmt(p.startsAt)} ~ {fmt(p.endsAt)} · 댓글 {p.allowComments ? '허용' : '없음'}
            {p.approvedByName ? ` · 승인 ${p.approvedByName}` : ''}
            {p.rejectReason ? ` · 반려 이유: ${p.rejectReason}` : ''}
          </p>
          {p.status === 'pending' && (
            <div className="space-y-2 rounded-md bg-surface p-3">
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  label="시작"
                  type="datetime-local"
                  className="w-56"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <Input
                  label="끝"
                  type="datetime-local"
                  className="w-56"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                <label className="flex min-h-tap items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                  />
                  홈 상단 고정 (최신 3개까지 보여요)
                </label>
                <Button
                  loading={run.isPending}
                  onClick={() =>
                    run.mutate(() =>
                      councilAdminApi.approve(p.id, {
                        isPinned,
                        startsAt: new Date(startsAt).toISOString(),
                        endsAt: new Date(endsAt).toISOString(),
                      }),
                    )
                  }
                >
                  승인·게시
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  label="반려 이유 (2~200자)"
                  className="flex-1"
                  value={reason}
                  maxLength={200}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  variant="danger"
                  disabled={reason.trim().length < 2}
                  loading={run.isPending}
                  onClick={() => run.mutate(() => councilAdminApi.reject(p.id, reason))}
                >
                  반려
                </Button>
              </div>
            </div>
          )}
          {p.status === 'approved' && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={run.isPending}
                onClick={() => run.mutate(() => councilAdminApi.pin(p.id, !p.isPinned))}
              >
                {p.isPinned ? '고정 해제' : '홈 상단 고정'}
              </Button>
              <Button
                variant="danger"
                loading={run.isPending}
                onClick={() =>
                  window.confirm('이 글을 숨길까요?') &&
                  run.mutate(() => councilAdminApi.hide(p.id))
                }
              >
                숨기기
              </Button>
            </div>
          )}
          {p.status === 'hidden' && (
            <Button
              variant="secondary"
              loading={run.isPending}
              onClick={() => run.mutate(() => councilAdminApi.unhide(p.id))}
            >
              숨김 해제
            </Button>
          )}
          {error && (
            <p role="alert" className="text-base text-danger-600">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function PostsSection() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'pending' | 'approved' | 'all'>('pending');
  const q = useQuery({
    queryKey: ['council', 'admin', scope],
    queryFn: () => councilAdminApi.posts(scope),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const onChanged = (m: string) => {
    setMsg(m);
    void qc.invalidateQueries({ queryKey: ['council'] });
  };
  return (
    <Card title="자치회 글" data-testid="council-posts">
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ['pending', '승인 대기'],
            ['approved', '게시 중'],
            ['all', '전체'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            variant={scope === k ? 'primary' : 'secondary'}
            onClick={() => setScope(k)}
          >
            {label}
          </Button>
        ))}
      </div>
      {msg && <p className="mb-2 text-base text-success-600">{msg}</p>}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && q.data.length === 0 && <EmptyState icon="🏫" title="글이 없어요" />}
      <ul className="space-y-2">
        {q.data?.map((p) => (
          <PostRow key={p.id} p={p} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  );
}

/** 자치회 관리 (CNC-03, 04, 07, 임원 지정). 승인 권한 교사 */
export function CouncilPage() {
  return (
    <>
      <PageHeader
        title="학생자치회"
        description="임원을 지정하고, 임원이 올린 글을 승인·고정·숨김 처리해요. 자치회 글에는 포인트가 없어요."
      />
      <div className="space-y-4">
        <PostsSection />
        <MembersSection />
      </div>
    </>
  );
}
