import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoticeView, TextsView } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { noticesApi, type NoticeInput } from '@/api/notices';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const emptyNotice = (): NoticeInput => {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86400000);
  return {
    title: '',
    body: '',
    startsAt: toLocalInput(now.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    isActive: true,
  };
};

function NoticesSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'notices'], queryFn: noticesApi.list });
  // 렌더 순수성: 현재 시각은 처음 한 번만 읽는다(게시 중 배지 판정용)
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<NoticeInput>(emptyNotice);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'notices'] });
    void qc.invalidateQueries({ queryKey: ['me', 'home'] });
    setEditing(null);
    setForm(emptyNotice());
  };
  const save = useMutation({
    mutationFn: async () => {
      if (editing !== null) await noticesApi.update(editing, form);
      else await noticesApi.create(form);
    },
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => noticesApi.remove(id),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const load = (n: NoticeView) => {
    setEditing(n.id);
    setForm({
      title: n.title,
      body: n.body,
      startsAt: toLocalInput(n.startsAt),
      endsAt: toLocalInput(n.endsAt),
      isActive: n.isActive,
    });
  };
  return (
    <Card title="공지 (홈 상단 배너, 최대 3개 표시)">
      {q.isLoading && <Spinner className="text-accent-600" />}
      <ul className="mb-4 divide-y divide-line">
        {q.data?.map((n) => {
          const live =
            n.isActive &&
            new Date(n.startsAt).getTime() <= now &&
            new Date(n.endsAt).getTime() >= now;
          return (
            <li
              key={n.id}
              className="flex flex-wrap items-center gap-2 py-2 text-base"
              data-testid={`notice-${n.id}`}
            >
              <Badge tone={live ? 'success' : n.isActive ? 'neutral' : 'warn'}>
                {live ? '게시 중' : n.isActive ? '기간 밖' : '꺼짐'}
              </Badge>
              <span className="font-semibold">{n.title}</span>
              <span className="text-ink-muted">
                {new Date(n.startsAt).toLocaleDateString('ko-KR')} ~{' '}
                {new Date(n.endsAt).toLocaleDateString('ko-KR')}
              </span>
              <span className="ml-auto flex gap-1">
                <Button variant="secondary" onClick={() => load(n)}>
                  수정
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => window.confirm('이 공지를 지울까요?') && remove.mutate(n.id)}
                >
                  삭제
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="rounded-md border border-line p-3">
        <p className="mb-2 text-base font-semibold">{editing !== null ? '공지 수정' : '새 공지'}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={100}
            className="md:col-span-2"
          />
          <Textarea
            label="내용"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={3}
            maxLength={2000}
            className="md:col-span-2"
          />
          <Input
            label="게시 시작"
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          />
          <Input
            label="게시 종료"
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex min-h-tap items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            게시
          </label>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {editing !== null ? '저장' : '추가'}
          </Button>
          {editing !== null && (
            <Button variant="ghost" onClick={refresh}>
              취소
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-base font-medium text-danger-600">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

function TextsSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'texts'], queryFn: noticesApi.texts });
  const [form, setForm] = useState<TextsView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = form ?? q.data;
  const save = useMutation({
    mutationFn: (v: TextsView) => noticesApi.updateTexts(v),
    onSuccess: (v) => {
      setForm(v);
      setMsg('문구를 저장했어요.');
      void qc.invalidateQueries({ queryKey: ['admin', 'texts'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (!t) return <Spinner className="text-accent-600" />;
  const set = (patch: Partial<TextsView>) => setForm({ ...t, ...patch });
  return (
    <Card title="안내 문구 편집">
      <div className="space-y-3">
        <Textarea
          label="캡처 안내 · 갤럭시"
          value={t.captureGuide.android_samsung}
          onChange={(e) =>
            set({ captureGuide: { ...t.captureGuide, android_samsung: e.target.value } })
          }
          rows={2}
          maxLength={500}
        />
        <Textarea
          label="캡처 안내 · 아이폰"
          value={t.captureGuide.iphone}
          onChange={(e) => set({ captureGuide: { ...t.captureGuide, iphone: e.target.value } })}
          rows={2}
          maxLength={500}
        />
        <Textarea
          label="캡처 주의 문구"
          value={t.captureGuide.warning}
          onChange={(e) => set({ captureGuide: { ...t.captureGuide, warning: e.target.value } })}
          rows={2}
          maxLength={300}
        />
        <Textarea
          label="좋은 댓글 기준"
          value={t.goodCommentGuide}
          onChange={(e) => set({ goodCommentGuide: e.target.value })}
          rows={2}
          maxLength={300}
        />
        <Textarea
          label="임원 검토 안내"
          value={t.reviewGuide}
          onChange={(e) => set({ reviewGuide: e.target.value })}
          rows={2}
          maxLength={500}
        />
      </div>
      {msg && <p className="mt-2 text-base text-success-600">{msg}</p>}
      {error && (
        <p role="alert" className="mt-2 text-base font-medium text-danger-600">
          {error}
        </p>
      )}
      <Button className="mt-3" loading={save.isPending} onClick={() => save.mutate(t)}>
        문구 저장
      </Button>
    </Card>
  );
}

/** 공지·문구 (ADM-04, 07) */
export function ContentPage() {
  return (
    <>
      <PageHeader
        title="공지·문구"
        description="홈 상단 공지와 학생에게 보이는 안내 문구를 관리해요."
      />
      <div className="space-y-4">
        <NoticesSection />
        <TextsSection />
      </div>
    </>
  );
}
