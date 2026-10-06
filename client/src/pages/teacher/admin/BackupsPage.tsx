import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupKind, BackupListView, BackupPointView } from '@server-types/api';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { backupsApi } from '@/api/backups';
import { ApiError, errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Spinner } from '@/components/ui';
import { useMeCache } from '@/hooks/useMe';
import { fmtBytes, fmtDateTime } from '@/lib/format';

/**
 * 백업·복원 (BKP-01~04, 관리자 전용)
 *  - 목록(만든 시각·종류·메모·크기), 지금 백업, 삭제, 복원(백업 이름을 그대로 입력)
 *  - 복원을 시작하면 서버가 1~2분 멈춘다. 목록 API 를 몇 초마다 다시 불러 끝났는지 본다:
 *    연결 실패 = 복원 중, 401 = 끝남(모두 로그아웃됨) → 로그인 화면, 200 + lastRestore.ok === false = 실패 사유 표시
 */
const KEY = ['admin', 'backups'] as const;
const POLL_MS = 3000;
const HELP_AFTER_MS = 10 * 60 * 1000;

const KIND_LABEL: Record<BackupKind, { text: string; tone: 'neutral' | 'info' | 'warn' }> = {
  auto: { text: '자동', tone: 'neutral' },
  manual: { text: '직접', tone: 'info' },
  prerestore: { text: '복원 직전', tone: 'warn' },
};

const BUSY_LABEL: Record<string, string> = {
  create: '백업을 만드는 중이에요',
  restore: '복원 중이에요',
  delete: '백업을 지우는 중이에요',
  prune: '오래된 백업을 정리하는 중이에요',
};

type Restoring = { id: string; since: number; done?: 'ok' | 'fail'; error?: string };

export function BackupsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cache = useMeCache();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BackupPointView | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupPointView | null>(null);
  const [restoring, setRestoring] = useState<Restoring | null>(null);
  const [waitedLong, setWaitedLong] = useState(false);

  const q = useQuery({
    queryKey: KEY,
    queryFn: backupsApi.list,
    enabled: !restoring,
    refetchInterval: (query) => (query.state.data?.busy ? POLL_MS : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const busy = q.data?.busy ?? null;

  const create = useMutation({
    mutationFn: () => backupsApi.create(label.trim()),
    onSuccess: () => {
      setLabel('');
      setError(null);
      setMsg('백업을 만들기 시작했어요. 잠시 뒤 목록에 나타나요.');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => backupsApi.remove(id),
    onSuccess: () => {
      setDeleting(null);
      setMsg('백업을 지웠어요.');
      refresh();
    },
    onError: (e) => {
      setDeleting(null);
      setError(errorMessage(e));
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => backupsApi.restore(id),
    onSuccess: (_r, id) => {
      setRestoreTarget(null);
      setError(null);
      setRestoring({ id, since: Date.now() });
    },
    onError: (e) => {
      setRestoreTarget(null);
      setError(errorMessage(e));
    },
  });

  // 복원 대기: 서버가 돌아올 때까지 목록 API 를 폴링
  useEffect(() => {
    if (!restoring || restoring.done) return;
    let stopped = false;
    const tick = async () => {
      if (Date.now() - restoring.since > HELP_AFTER_MS) setWaitedLong(true);
      try {
        const view = await backupsApi.list();
        if (stopped) return;
        if (view.busy?.op === 'restore') return; // 아직 진행 중
        const last = view.lastRestore;
        if (last && last.id === restoring.id && last.finishedAt) {
          if (last.ok) setRestoring({ ...restoring, done: 'ok' });
          else
            setRestoring({ ...restoring, done: 'fail', error: last.error ?? '복원이 실패했어요.' });
        }
      } catch (err) {
        if (stopped) return;
        // 401 = 복원이 끝나 모든 로그인이 풀렸다는 뜻. 그 외(연결 실패·502)는 아직 복원 중
        if (err instanceof ApiError && err.status === 401)
          setRestoring({ ...restoring, done: 'ok' });
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [restoring]);

  // 끝났으면 잠시 안내를 보여 준 뒤 로그인 화면으로
  useEffect(() => {
    if (restoring?.done !== 'ok') return;
    const t = setTimeout(() => {
      cache.clear();
      navigate('/login', { replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [restoring, cache, navigate]);

  if (restoring) {
    return (
      <>
        <PageHeader title="백업·복원" />
        <Card data-testid="restoring">
          {restoring.done === 'ok' && (
            <p className="text-lg font-bold text-success-600">
              복원이 끝났어요. 모두 다시 로그인해야 해요. 잠시 뒤 로그인 화면으로 이동해요.
            </p>
          )}
          {restoring.done === 'fail' && (
            <div className="space-y-2">
              <p className="text-lg font-bold text-danger-600">복원이 실패했어요.</p>
              <p className="text-base">{restoring.error}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setRestoring(null);
                  setWaitedLong(false);
                }}
              >
                목록으로
              </Button>
            </div>
          )}
          {!restoring.done && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Spinner className="text-accent-600" />
                <p className="text-lg font-bold">복원 중이에요. 1~2분쯤 걸려요.</p>
              </div>
              <p className="text-base text-ink-muted">
                복원하는 동안 사이트가 잠시 멈춰요. 이 화면을 닫지 말고 기다려 주세요. 끝나면 모두
                다시 로그인해야 해요.
              </p>
              <p className="text-base text-ink-muted">백업 이름: {restoring.id}</p>
              {waitedLong && (
                <p className="rounded-md bg-warn-50 px-3 py-2 text-base text-warn-600">
                  10분이 지났어요. 사이트가 돌아오지 않으면 관리자(개발자)에게 연락해 주세요.
                </p>
              )}
            </div>
          )}
        </Card>
      </>
    );
  }

  const trimmed = label.trim();
  const canCreate = !busy && trimmed.length <= 60;

  return (
    <>
      <PageHeader
        title="백업·복원"
        description="지금 상태(글·포인트·사진·계정)를 저장해 두고, 문제가 생기면 그 시점으로 되돌릴 수 있어요."
      />
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.isError && <p className="text-base text-danger-600">{errorMessage(q.error)}</p>}
      {q.data && !q.data.enabled && (
        <EmptyState
          icon="🗄️"
          title="이 서버에서는 백업 기능을 쓸 수 없어요"
          description="서버 설정(BACKUP_DIR)이 없어요. 운영 서버에서만 켜져 있어요."
        />
      )}
      {q.data?.enabled && (
        <div className="space-y-4">
          <StatusBar view={q.data} />
          {busy && (
            <div
              className="flex items-center gap-3 rounded-md bg-info-50 px-3 py-2 text-base text-info-600"
              data-testid="backup-busy"
            >
              <Spinner className="text-info-600" />
              {BUSY_LABEL[busy.op] ?? '작업 중이에요'}… 끝나면 목록이 자동으로 바뀌어요.
            </div>
          )}
          {q.data.lastError && (
            <p className="rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">
              마지막 작업 실패({fmtDateTime(q.data.lastError.at)}): {q.data.lastError.message}
            </p>
          )}
          {msg && (
            <p className="rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
          )}
          {error && (
            <p className="rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">{error}</p>
          )}

          <Card title="지금 백업">
            <form
              className="flex flex-wrap items-start gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (canCreate) create.mutate();
              }}
            >
              <Input
                label="메모(선택, 60자까지)"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setMsg(null);
                }}
                maxLength={60}
                placeholder="예: 시범 운영 시작 전"
                className="w-72 max-w-full"
              />
              <Button
                type="submit"
                loading={create.isPending}
                disabled={!canCreate}
                className="mt-7"
              >
                지금 백업
              </Button>
            </form>
          </Card>

          <Card title={`백업 목록 (${q.data.points.length}개)`}>
            {q.data.points.length === 0 ? (
              <p className="text-base text-ink-muted">
                아직 백업이 없어요. "지금 백업"으로 첫 백업을 만들어 주세요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-base">
                  <thead>
                    <tr className="border-b border-line text-ink-muted">
                      <th className="py-2 pr-3">만든 시각</th>
                      <th className="py-2 pr-3">종류</th>
                      <th className="py-2 pr-3">메모</th>
                      <th className="py-2 pr-3">DB</th>
                      <th className="py-2 pr-3">사진</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.points.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-line/60"
                        data-testid={`backup-${p.id}`}
                      >
                        <td className="py-2 pr-3">
                          <div className="font-semibold">{fmtDateTime(p.createdAt, true)}</div>
                          <div className="text-ink-muted">{p.id}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={KIND_LABEL[p.kind].tone} className="whitespace-nowrap">
                            {KIND_LABEL[p.kind].text}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          {p.label || <span className="text-ink-muted">-</span>}
                        </td>
                        <td className="py-2 pr-3">{fmtBytes(p.dbBytes)}</td>
                        <td className="py-2 pr-3">
                          {fmtBytes(p.uploadsBytes)}{' '}
                          <span className="text-ink-muted">({p.fileCount}장)</span>
                        </td>
                        <td className="py-2">
                          <div className="flex justify-end gap-1 whitespace-nowrap">
                            <Button
                              variant="secondary"
                              disabled={!!busy || !p.restorable}
                              title={
                                p.restorable
                                  ? undefined
                                  : '지금 서버 코드로는 복원할 수 없는 백업이에요.'
                              }
                              onClick={() => setRestoreTarget(p)}
                            >
                              이 시점으로 복원
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={!!busy}
                              onClick={() => setDeleting(p)}
                              aria-label={`${p.id} 삭제`}
                            >
                              삭제
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="백업 삭제"
          message={`${fmtDateTime(deleting.createdAt, true)} 백업(${deleting.id})을 완전히 지울까요? 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {restoreTarget && (
        <ConfirmDialog
          title="이 시점으로 복원"
          message={
            <div className="space-y-2">
              <p>
                <strong>{fmtDateTime(restoreTarget.createdAt, true)}</strong> 상태로 되돌려요.
                {restoreTarget.label ? ` (메모: ${restoreTarget.label})` : ''}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>그 뒤에 쓴 글·댓글·포인트·사진·계정·비밀번호 변경이 모두 사라져요.</li>
                <li>복원 직전 상태는 자동으로 한 번 더 백업해 두어요.</li>
                <li>1~2분 동안 사이트가 멈추고, 끝나면 모두 다시 로그인해야 해요.</li>
              </ul>
            </div>
          }
          confirmLabel="복원 시작"
          danger
          requireText={restoreTarget.id}
          loading={restore.isPending}
          onConfirm={() => restore.mutate(restoreTarget.id)}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </>
  );
}

function StatusBar({ view }: { view: BackupListView }) {
  const last = view.lastRestore;
  return (
    <div
      className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-line bg-surface px-3 py-2 text-base"
      data-testid="backup-status"
    >
      <span>
        서버 남은 공간 <strong>{fmtBytes(view.diskFreeBytes)}</strong> /{' '}
        {fmtBytes(view.diskTotalBytes)}
      </span>
      <span>자동 백업 매일 새벽 3시 30분 · 자동 백업은 {view.keepDays}일 보관</span>
      {last && (
        <span className={last.ok ? 'text-success-600' : 'text-danger-600'}>
          마지막 복원 {fmtDateTime(last.finishedAt ?? last.startedAt, true)}:{' '}
          {last.ok
            ? '완료'
            : last.finishedAt
              ? `실패 (${last.error ?? last.phase})`
              : `진행 중 (${last.phase})`}
        </span>
      )}
    </div>
  );
}
