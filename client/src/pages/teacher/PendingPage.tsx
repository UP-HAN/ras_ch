import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RejectReasonCode, TeacherPostView } from '@server-types/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { teacherPostsApi } from '@/api/teacherPosts';
import { PageHeader } from '@/components/layout/PageHeader';
import { tagLabel, typeLabel } from '@/components/post/articleMeta';
import { IMAGE_KIND_LABEL, POST_TYPE_LABEL } from '@/components/post/postLabels';
import { minutesLabel, UsageDiff } from '@/components/post/UsageDiff';
import { Badge, Button, Card, EmptyState, Modal, Spinner, Textarea } from '@/components/ui';
import { useClassParam } from '@/hooks/useClassParam';
import { fmtDateTime } from '@/lib/format';
import { ACTOR_ROLE_LABEL, CHECKLIST_LABEL, REVIEW_ACTION_LABEL } from '@/lib/reviewLabels';

const REASONS: Array<{ code: RejectReasonCode; label: string }> = [
  { code: 'capture_mismatch', label: '캡처 불일치' },
  { code: 'too_short', label: '글자 수 부족' },
  { code: 'inappropriate', label: '부적절한 내용' },
  { code: 'not_polite', label: '존댓말 아님' },
  { code: 'other', label: '직접 입력' },
];

type Stage = 'reviewed' | 'flagged' | 'pending';
const STAGES: Array<{
  key: Stage;
  label: string;
  tone: 'success' | 'warn' | 'info';
  hint: string;
}> = [
  {
    key: 'reviewed',
    label: '1차 통과',
    tone: 'success',
    hint: '임원이 체크리스트를 다 확인했어요.',
  },
  { key: 'flagged', label: '보류 요청', tone: 'warn', hint: '임원이 판단을 선생님께 넘겼어요.' },
  { key: 'pending', label: '미검토', tone: 'info', hint: '아직 임원 검토 전이에요.' },
];

const REASON_MIN = 5;

/**
 * 승인 대기함 (TCH-02, APR-05, 06, 07, 08):
 *  - 2단계 반: 1차 통과 / 보류 요청 / 미검토(기준 시간 초과 표시) 3구간 + "1차 통과 전체 승인"
 *  - 교사 단독 반: 한 목록
 *  - 임원 체크 결과·메모, 검토 이력 모달
 *  - 리포트·일기·기사 모두 포함, 유형 배지 표시 (QA #3)
 */
export function PendingPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const { selected, select } = useClassParam(classes.data);
  const queue = useQuery({
    queryKey: ['teacher', 'pending', selected],
    queryFn: () => teacherPostsApi.pending(selected as number),
    enabled: selected !== null,
  });
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<TeacherPostView | null>(null);
  const [reasonCode, setReasonCode] = useState<RejectReasonCode>('capture_mismatch');
  const [reasonText, setReasonText] = useState('');
  const [historyOf, setHistoryOf] = useState<TeacherPostView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['teacher', 'pending'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'posts'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'pending-counts'] });
    void qc.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    setChecked(new Set());
  };
  const approve = useMutation({
    mutationFn: (id: number) => teacherPostsApi.approve(id),
    onSuccess: (p) => {
      setMsg(`${p.author.name} 학생 글을 승인했어요.`);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: number; code: RejectReasonCode; text: string }) =>
      teacherPostsApi.reject(v.id, v.code, v.text),
    onSuccess: (p) => {
      setMsg(`${p.author.name} 학생 글을 반려했어요.`);
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
  const bulkReviewed = useMutation({
    mutationFn: (cid: number) => teacherPostsApi.bulkApproveReviewed(cid),
    onSuccess: (r) => {
      setMsg(
        `1차 통과 ${r.approved.length}건 승인${r.failed.length ? `, ${r.failed.length}건 실패` : ''}`,
      );
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const history = useQuery({
    queryKey: ['teacher', 'history', historyOf?.id],
    queryFn: () => teacherPostsApi.history(historyOf?.id as number),
    enabled: historyOf !== null,
  });

  const items = queue.data?.items ?? [];
  const twoStep = queue.data?.approvalMode === 'two_step';
  const escalated = new Set(queue.data?.escalatedIds ?? []);
  const allChecked = items.length > 0 && checked.size === items.length;
  const toggle = (id: number) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // QA #13: 사유(프리셋 또는 5자 이상 직접 입력)가 있어야 반려 가능
  const rejectReady = reasonCode !== 'other' || reasonText.trim().length >= REASON_MIN;
  const closeReject = () => {
    setRejecting(null);
    setReasonText('');
  };

  const renderPost = (p: TeacherPostView) => (
    <Card key={p.id} data-testid={`pending-${p.status}`}>
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
        <Badge tone={p.type === 'article' ? 'primary' : p.type === 'diary' ? 'neutral' : 'info'}>
          {POST_TYPE_LABEL[p.type] ?? p.type}
        </Badge>
        {escalated.has(p.id) && (
          <Badge tone="danger">{queue.data?.autoEscalateHours ?? 48}시간 지남</Badge>
        )}
        {p.weekKey && <span className="text-base text-ink-muted">{p.weekKey}</span>}
        <span className="ml-auto text-base text-ink-muted">{fmtDateTime(p.submittedAt)}</span>
      </div>
      {p.images.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {p.images.map((img) => (
            <a
              key={img.id}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${IMAGE_KIND_LABEL[img.kind] ?? '이미지'} 크게 보기`}
            >
              <img
                src={img.url}
                alt={IMAGE_KIND_LABEL[img.kind] ?? '이미지'}
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
      {p.type === 'article' && (
        <p className="mb-1 text-lg font-bold">
          📰 {p.title}
          {p.article && (
            <span className="ml-2 text-base font-normal text-ink-muted">
              {typeLabel(p.article.articleType)} · {p.article.tags.map(tagLabel).join(' ')}
            </span>
          )}
        </p>
      )}
      <p className="mb-1 whitespace-pre-wrap text-base">{p.body}</p>
      {p.goalText && <p className="mb-3 text-base text-ink-muted">🎯 {p.goalText}</p>}
      {p.article?.oneLine && (
        <p className="mb-3 text-base text-ink-muted">💬 {p.article.oneLine}</p>
      )}
      {p.councilReview.result && (
        <div
          className={`mb-2 rounded-md px-3 py-2 text-base ${p.councilReview.result === 'pass' ? 'bg-success-50' : 'bg-warn-50'}`}
        >
          <p className="font-semibold">
            임원 {p.councilReview.result === 'pass' ? '1차 통과' : '보류 요청'}
            {p.councilReview.reviewedAt && (
              <span className="ml-2 font-normal text-ink-muted">
                {fmtDateTime(p.councilReview.reviewedAt)}
              </span>
            )}
          </p>
          {p.councilReview.checklist && (
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(p.councilReview.checklist).map(([code, ok]) => (
                <li key={code} className={ok ? 'text-success-600' : 'text-danger-600'}>
                  {ok ? '✓' : '✗'} {CHECKLIST_LABEL[code] ?? code}
                </li>
              ))}
            </ul>
          )}
          {p.councilReview.note && <p className="mt-1">메모: {p.councilReview.note}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => approve.mutate(p.id)}
          loading={approve.isPending && approve.variables === p.id}
        >
          승인
        </Button>
        <Button variant="secondary" onClick={() => setRejecting(p)}>
          반려
        </Button>
        <Button variant="ghost" onClick={() => setHistoryOf(p)}>
          이력
        </Button>
        <Link
          to={`/teacher/posts/${p.id}`}
          className="inline-flex min-h-tap items-center px-2 text-base underline"
        >
          상세
        </Link>
      </div>
    </Card>
  );

  const section = (stage: (typeof STAGES)[number]) => {
    const list = items.filter((p) => p.status === stage.key);
    return (
      <section key={stage.key} className="mb-6" data-testid={`stage-${stage.key}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{stage.label}</h2>
          <Badge tone={stage.tone}>{list.length}건</Badge>
          <span className="text-base text-ink-muted">{stage.hint}</span>
          {stage.key === 'reviewed' && list.length > 0 && selected !== null && (
            <Button
              className="ml-auto"
              loading={bulkReviewed.isPending}
              onClick={() => bulkReviewed.mutate(selected)}
            >
              1차 통과 {list.length}건 전체 승인
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-3 text-base text-ink-muted">
            없어요.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">{list.map(renderPost)}</div>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title="승인 대기함"
        description="리포트·일기·기사를 확인하고 승인하면 게시되고 포인트가 지급돼요."
        action={
          queue.data && (
            <Badge tone={twoStep ? 'info' : 'neutral'} className="whitespace-nowrap">
              {twoStep ? '2단계 승인 반' : '교사 단독 승인 반'}
            </Badge>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex flex-wrap gap-2" role="group" aria-label="반 선택">
          {classes.data?.map((c) => (
            <Button
              key={c.id}
              variant={c.id === selected ? 'primary' : 'secondary'}
              aria-pressed={c.id === selected}
              onClick={() => {
                select(c.id);
                setChecked(new Set());
              }}
            >
              {c.name}
            </Button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={items.length === 0}
            aria-pressed={allChecked}
            onClick={() => setChecked(allChecked ? new Set() : new Set(items.map((i) => i.id)))}
          >
            {allChecked ? '전체 해제' : '전체 선택'}
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

      {queue.data && items.length > 0 && twoStep && STAGES.map(section)}
      {queue.data && items.length > 0 && !twoStep && (
        <div className="grid gap-4 xl:grid-cols-2">{items.map(renderPost)}</div>
      )}

      {rejecting && (
        <Modal title={`${rejecting.author.name} 학생 글 반려`} onClose={closeReject}>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="반려 사유">
            {REASONS.map((r) => (
              <Button
                key={r.code}
                variant={reasonCode === r.code ? 'primary' : 'secondary'}
                aria-pressed={reasonCode === r.code}
                onClick={() => setReasonCode(r.code)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {reasonCode === 'other' && (
            <Textarea
              label={`학생에게 보여줄 사유 (${REASON_MIN}~200자)`}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              maxLength={200}
              hint={
                reasonText.trim().length < REASON_MIN
                  ? `${REASON_MIN}자 이상 적어야 반려할 수 있어요.`
                  : `${reasonText.trim().length}자`
              }
            />
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeReject}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={reject.isPending}
              disabled={!rejectReady}
              onClick={() =>
                reject.mutate({ id: rejecting.id, code: reasonCode, text: reasonText })
              }
            >
              반려하기
            </Button>
          </div>
        </Modal>
      )}

      {historyOf && (
        <Modal
          title={`${historyOf.author.name} 학생 글 검토 이력`}
          className="max-w-lg"
          onClose={() => setHistoryOf(null)}
          action={
            <Button variant="ghost" onClick={() => setHistoryOf(null)}>
              닫기
            </Button>
          }
        >
          {history.isLoading && <Spinner className="text-accent-600" />}
          {history.data && history.data.length === 0 && (
            <p className="text-base text-ink-muted">아직 이력이 없어요.</p>
          )}
          {history.data && history.data.length > 0 && (
            <ol className="space-y-2">
              {history.data.map((h) => (
                <li key={h.id} className="rounded-md border border-line px-3 py-2 text-base">
                  <p className="font-semibold">
                    {REVIEW_ACTION_LABEL[h.action] ?? h.action}
                    <span className="ml-2 font-normal text-ink-muted">
                      {ACTOR_ROLE_LABEL[h.actorRole] ?? h.actorRole}
                      {h.actorName ? ` ${h.actorName}` : ''} · {fmtDateTime(h.createdAt)}
                    </span>
                  </p>
                  {h.checklist && (
                    <p className="text-ink-muted">
                      {Object.entries(h.checklist)
                        .map(([c, ok]) => `${ok ? '✓' : '✗'} ${CHECKLIST_LABEL[c] ?? c}`)
                        .join(' / ')}
                    </p>
                  )}
                  {h.note && <p>{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Modal>
      )}
    </>
  );
}
