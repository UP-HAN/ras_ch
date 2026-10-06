import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BugReportAdminView, BugStatusView } from '@server-types/api';
import { bugReportsApi } from '@/api/bugReports';
import { errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/format';

/** 버그 신고함 — 관리자 전용 (BUG-03, BUG-04). 상태를 바꾸고 답변을 남긴다 */
const STATUS_LABEL: Record<BugStatusView, string> = {
  received: '받음',
  checking: '확인 중',
  resolved: '해결',
  held: '보류',
};
const STATUS_TONE: Record<BugStatusView, 'neutral' | 'info' | 'success' | 'warn'> = {
  received: 'neutral',
  checking: 'info',
  resolved: 'success',
  held: 'warn',
};
const STATUSES = Object.keys(STATUS_LABEL) as BugStatusView[];

const ROLE_LABEL: Record<string, string> = {
  student: '학생',
  teacher: '교사',
  admin: '관리자',
  council_teacher: '검토 계정',
};

function ReportCard({ r }: { r: BugReportAdminView }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<BugStatusView>(r.status);
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      bugReportsApi.adminReply(r.id, { status, adminReply: reply.trim() === '' ? null : reply }),
    onSuccess: () => {
      setReply('');
      setErr(null);
      setMsg('저장했습니다. 신고자에게 알림이 갑니다.');
      void qc.invalidateQueries({ queryKey: ['admin', 'bug-reports'] });
    },
    onError: (e) => {
      setMsg(null);
      setErr(errorMessage(e));
    },
  });

  const dirty = status !== r.status || reply.trim() !== '';

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        <span className="font-bold">{r.title}</span>
        <span className="ml-auto text-base text-ink-muted">#{r.id}</span>
      </div>
      <p className="mt-1 text-base text-ink-muted">
        {r.reporterName ?? '(알 수 없음)'}
        {r.className ? ` · ${r.className}` : ''}
        {r.reporterRole ? ` · ${ROLE_LABEL[r.reporterRole] ?? r.reporterRole}` : ''} ·{' '}
        {fmtDateTime(r.createdAt, true)}
      </p>
      {r.pagePath && (
        <p className="mt-1 break-all text-base text-ink-muted">신고한 화면: {r.pagePath}</p>
      )}
      <p className="mt-2 whitespace-pre-wrap text-base">{r.body}</p>
      {r.imagePath && (
        <a
          href={`/uploads/${r.imagePath}`}
          target="_blank"
          rel="noreferrer"
          title="새 탭에서 크게 보기"
          className="mt-2 flex min-h-tap w-fit items-center rounded-md border border-line p-1 hover:bg-accent-50"
        >
          <img
            src={`/uploads/${r.imagePath}`}
            alt="신고자가 올린 사진 (눌러서 크게 보기)"
            className="max-h-72 max-w-full rounded"
          />
        </a>
      )}
      {r.adminReply && (
        <div className="mt-2 rounded-md bg-primary-50 p-2">
          <p className="text-base font-semibold text-primary-800">지금 답변</p>
          <p className="mt-0.5 whitespace-pre-wrap text-base">{r.adminReply}</p>
          {r.repliedAt && (
            <p className="mt-1 text-base text-ink-muted">{fmtDateTime(r.repliedAt, true)}</p>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-1 text-base font-semibold">처리 상태</p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                'min-h-tap rounded-md border px-3 text-base font-semibold',
                status === s
                  ? 'border-accent-600 bg-accent-600 text-white'
                  : 'border-line-strong bg-surface text-ink hover:bg-accent-50',
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Textarea
          className="mt-2"
          label="답변 (비워 두면 상태만 바꿉니다)"
          rows={3}
          maxLength={2000}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="신고자가 읽을 답변을 존댓말로 적어 주세요."
        />
        {err && (
          <p role="alert" className="mt-1 text-base font-medium text-danger-600">
            {err}
          </p>
        )}
        {msg && <p className="mt-1 text-base font-medium text-success-600">{msg}</p>}
        <Button className="mt-2" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </li>
  );
}

export function BugReportsPage() {
  const [filter, setFilter] = useState<BugStatusView | 'all'>('all');
  const list = useQuery({
    queryKey: ['admin', 'bug-reports', filter],
    queryFn: () => bugReportsApi.adminList(filter === 'all' ? undefined : filter),
  });

  return (
    <>
      <PageHeader
        title="버그 신고함"
        description="학생·교사가 보낸 신고입니다. 상태를 바꾸거나 답변하면 신고자에게 알림이 갑니다."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-1">
          {(['all', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                'min-h-tap rounded-md border px-3 text-base font-semibold',
                filter === s
                  ? 'border-accent-600 bg-accent-600 text-white'
                  : 'border-line-strong bg-surface text-ink hover:bg-accent-50',
              )}
            >
              {s === 'all' ? '전체' : STATUS_LABEL[s]}
            </button>
          ))}
          {list.data && (
            <span className="ml-auto text-base text-ink-muted">
              {list.data.reports.length}건 표시 · 전체 {list.data.total}건 · 처리할 것{' '}
              {list.data.openCount}건
            </span>
          )}
        </div>
      </Card>

      <div className="mt-4">
        {list.isLoading ? (
          <Spinner />
        ) : list.data && list.data.reports.length > 0 ? (
          <ul className="space-y-3">
            {list.data.reports.map((r) => (
              <ReportCard key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="📮"
            title="신고가 없습니다."
            description="학생은 내 정보 화면에서, 교사는 메뉴에서 신고를 보낼 수 있습니다."
          />
        )}
      </div>
    </>
  );
}
