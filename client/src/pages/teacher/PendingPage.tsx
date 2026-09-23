import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RejectReasonCode, TeacherPostView } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { teacherPostsApi } from '@/api/teacherPosts';
import { PageHeader } from '@/components/layout/PageHeader';
import { minutesLabel, UsageDiff } from '@/components/post/UsageDiff';
import { Badge, Button, Card, EmptyState, Spinner, Textarea } from '@/components/ui';

const REASONS: Array<{ code: RejectReasonCode; label: string }> = [
  { code: 'capture_mismatch', label: '캡처 불일치' },
  { code: 'too_short', label: '글자 수 부족' },
  { code: 'inappropriate', label: '부적절한 내용' },
  { code: 'other', label: '직접 입력' },
];

const STAGE: Record<string, { label: string; tone: 'info' | 'success' | 'warn' }> = {
  pending: { label: '미검토', tone: 'info' },
  reviewed: { label: '1차 통과', tone: 'success' },
  flagged: { label: '보류 요청', tone: 'warn' },
};

/** 승인 대기함 (TCH-02 기본형, APR-06): 개별 승인/반려(사유), 선택 일괄 승인. 3구간 UI 는 S4 */
export function PendingPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const selected = classId ?? classes.data?.[0]?.id ?? null;
  const queue = useQuery({
    queryKey: ['teacher', 'pending', selected],
    queryFn: () => teacherPostsApi.pending(selected as number),
    enabled: selected !== null,
  });
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<TeacherPostView | null>(null);
  const [reasonCode, setReasonCode] = useState<RejectReasonCode>('capture_mismatch');
  const [reasonText, setReasonText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['teacher', 'pending'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'posts'] });
    setChecked(new Set());
  };
  const approve = useMutation({
    mutationFn: (id: number) => teacherPostsApi.approve(id),
    onSuccess: (p) => {
      setMsg(`${p.author.name} 학생 리포트를 승인했어요.`);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: number; code: RejectReasonCode; text: string }) =>
      teacherPostsApi.reject(v.id, v.code, v.text),
    onSuccess: (p) => {
      setMsg(`${p.author.name} 학생 리포트를 반려했어요.`);
      setRejecting(null);
      setReasonText('');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const bulk = useMutation({
    mutationFn: (ids: number[]) => teacherPostsApi.bulkApprove(ids),
    onSuccess: (r) => {
      setMsg(`${r.approved.length}건 승인${r.failed.length ? `, ${r.failed.length}건 실패` : ''}`);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const items = queue.data?.items ?? [];
  const toggle = (id: number) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="승인 대기함"
        description="리포트를 확인하고 승인하면 게시되고 포인트가 지급돼요."
        action={
          queue.data && (
            <Badge tone={queue.data.approvalMode === 'two_step' ? 'info' : 'neutral'}>
              {queue.data.approvalMode === 'two_step' ? '2단계 승인 반' : '교사 단독 승인 반'}
            </Badge>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            onClick={() => {
              setClassId(c.id);
              setChecked(new Set());
            }}
          >
            {c.name}
          </Button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={items.length === 0}
            onClick={() => setChecked(new Set(items.map((i) => i.id)))}
          >
            전체 선택
          </Button>
          <Button
            disabled={checked.size === 0}
            loading={bulk.isPending}
            onClick={() => bulk.mutate([...checked])}
          >
            선택 {checked.size}건 승인
          </Button>
        </span>
      </div>
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {error}
        </p>
      )}
      {queue.isLoading && <Spinner className="text-accent-600" />}
      {queue.data && items.length === 0 && (
        <EmptyState
          icon="🗂️"
          title="대기 중인 글이 없어요"
          description="학생들이 리포트를 보내면 여기에 쌓여요."
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((p) => {
          const stage = STAGE[p.status] ?? STAGE.pending!;
          return (
            <Card key={p.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="flex min-h-tap items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checked.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="text-lg font-bold">
                    {p.author.className} {p.author.studentNo}번 {p.author.name}
                  </span>
                </label>
                <Badge tone={stage.tone}>{stage.label}</Badge>
                <span className="text-base text-ink-muted">{p.weekKey}</span>
                {p.type === 'diary' && <Badge tone="neutral">일기형</Badge>}
                <span className="ml-auto text-base text-ink-muted">
                  {p.submittedAt ? new Date(p.submittedAt).toLocaleString('ko-KR') : ''}
                </span>
              </div>
              {p.images.length > 0 && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {p.images.map((img) => (
                    <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                      <img
                        src={img.url}
                        alt={img.kind}
                        width={img.width}
                        height={img.height}
                        loading="lazy"
                        className="max-h-56 w-full rounded-md border border-line object-contain"
                      />
                    </a>
                  ))}
                </div>
              )}
              {p.report && (
                <p className="mb-2 flex flex-wrap items-center gap-2 text-base">
                  하루 평균 <strong>{minutesLabel(p.report.avgMinutesPerDay)}</strong>
                  <UsageDiff
                    avg={p.report.avgMinutesPerDay}
                    prev={p.report.prevAvgMinutes}
                    diff={p.report.diffMinutes}
                  />
                  {p.report.topCategory && <span>· {p.report.topCategory}</span>}
                  {p.report.topApp && <span>· {p.report.topApp}</span>}
                </p>
              )}
              <p className="mb-1 whitespace-pre-wrap text-base">{p.body}</p>
              <p className="mb-3 text-base text-ink-muted">🎯 {p.goalText}</p>
              {p.councilReview.note && (
                <p className="mb-2 rounded-md bg-warn-50 px-3 py-1 text-base text-warn-600">
                  임원 메모: {p.councilReview.note}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => approve.mutate(p.id)}
                  loading={approve.isPending && approve.variables === p.id}
                >
                  승인
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(p)}>
                  반려
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {rejecting && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-accent-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card title={`${rejecting.author.name} 학생 리포트 반려`} className="w-full max-w-md">
            <div className="mb-3 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <Button
                  key={r.code}
                  variant={reasonCode === r.code ? 'primary' : 'secondary'}
                  onClick={() => setReasonCode(r.code)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            {reasonCode === 'other' && (
              <Textarea
                label="학생에게 보여줄 사유 (5~200자)"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={3}
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(null)}>
                취소
              </Button>
              <Button
                variant="danger"
                loading={reject.isPending}
                onClick={() =>
                  reject.mutate({ id: rejecting.id, code: reasonCode, text: reasonText })
                }
              >
                반려하기
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
