import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CouncilPollView } from '@server-types/api';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { councilApi } from '@/api/council';
import { COUNCIL_STATUS, COUNCIL_TYPE } from '@/components/council/councilLabels';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReactionsSection } from '@/components/post/Reactions';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useReadTracker } from '@/hooks/useReadTracker';
import { cn } from '@/lib/cn';

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

function Poll({
  poll,
  onVote,
  busy,
}: {
  poll: CouncilPollView;
  onVote: (optionId: number) => void;
  busy: boolean;
}) {
  const total = poll.totalVotes ?? 0;
  return (
    <Card title="🗳️ 투표" tone="primary" data-testid="council-poll">
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const pct =
            poll.resultsVisible && total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
          const mine = poll.myOptionId === o.id;
          return (
            <li key={o.id}>
              {poll.canVote ? (
                <Button
                  block
                  size="lg"
                  variant="secondary"
                  loading={busy}
                  onClick={() => onVote(o.id)}
                  data-testid={`poll-option-${o.id}`}
                >
                  {o.label}
                </Button>
              ) : (
                <div
                  className={cn(
                    'relative overflow-hidden rounded-md border-2 px-3 py-2',
                    mine ? 'border-primary-600' : 'border-line',
                  )}
                >
                  {poll.resultsVisible && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-primary-100"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  <div className="relative flex items-center justify-between text-base">
                    <span className="font-semibold">
                      {mine ? '✅ ' : ''}
                      {o.label}
                    </span>
                    {poll.resultsVisible && (
                      <span className="font-bold text-primary-800">
                        {o.votes}표 · {pct}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-base text-ink-muted">
        {poll.canVote
          ? '한 번 고르면 바꿀 수 없어요. 잘 생각하고 골라요!'
          : poll.myOptionId
            ? '투표했어요. 고마워요!'
            : ''}
        {!poll.resultsVisible && ' 결과는 투표가 끝나면 볼 수 있어요.'}
        {poll.resultsVisible && total > 0 && ` 모두 ${total}명이 투표했어요.`}
      </p>
    </Card>
  );
}

/** 자치회 글 상세 (CNC-01, 02, 06): 본문·사진·투표·댓글(포인트 없음)·읽기 추적 */
export function CouncilPostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['council', 'post', postId],
    queryFn: () => councilApi.get(postId),
    enabled: Number.isInteger(postId),
  });
  const [error, setError] = useState<string | null>(null);
  const vote = useMutation({
    mutationFn: (optionId: number) => councilApi.pollVote(postId, optionId),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['council'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: () => councilApi.submit(postId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['council'] }),
    onError: (e) => setError(errorMessage(e)),
  });
  const p = q.data;
  const readable = !!p && (p.status === 'approved' || p.status === 'expired');
  useReadTracker(readable ? { type: 'council_post', id: postId } : null, readable);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-accent-600" />
      </div>
    );
  }
  if (!p) {
    return (
      <EmptyState
        icon="🙈"
        title="이 글은 볼 수 없어요"
        action={<Button onClick={() => navigate('/council')}>자치회 게시판으로</Button>}
      />
    );
  }
  const t = COUNCIL_TYPE[p.type];
  const st = COUNCIL_STATUS[p.status];
  return (
    <>
      <PageHeader
        title={`${t.emoji} 학생자치회 ${t.label}`}
        action={
          st && p.status !== 'approved' ? <Badge tone={st.tone}>{st.label}</Badge> : undefined
        }
      />
      {p.status === 'rejected' && p.rejectReason && (
        <Card tone="primary" className="mb-4" title="선생님 말씀">
          <p className="text-base">{p.rejectReason}</p>
        </Card>
      )}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-extrabold">{p.title}</h2>
          <p className="mt-1 text-base text-ink-muted">
            {p.authorLabel} · {dateLabel(p.startsAt)} ~ {dateLabel(p.endsAt)}
            {p.isPinned && (
              <Badge tone="warn" className="ml-2">
                📌 고정
              </Badge>
            )}
          </p>
        </div>
        {p.images.length > 0 && (
          <div className="space-y-2">
            {p.images.map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt=""
                width={img.width}
                height={img.height}
                className="w-full rounded-lg"
              />
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-lg leading-relaxed">{p.body}</p>
        {p.poll && <Poll poll={p.poll} onVote={(o) => vote.mutate(o)} busy={vote.isPending} />}
        {error && (
          <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">
            {error}
          </p>
        )}
        {p.canEdit && (
          <div className="space-y-2">
            <Button block variant="secondary" onClick={() => navigate(`/council/${p.id}/edit`)}>
              고치기 (임원 함께 고칠 수 있어요)
            </Button>
            {(p.status === 'draft' || p.status === 'rejected') && (
              <Button block loading={submit.isPending} onClick={() => submit.mutate()}>
                선생님께 보내기
              </Button>
            )}
          </div>
        )}
        {readable && (
          <ReactionsSection
            target={{ type: 'council_post', id: p.id }}
            isMine={false}
            showLike={p.isLive}
            canComment={p.isLive && p.allowComments}
            closedText={
              p.allowComments
                ? '게시 기간이 끝나서 읽기만 할 수 있어요.'
                : '이 글은 댓글을 받지 않아요.'
            }
            title="댓글"
          />
        )}
        {readable && (
          <p className="text-base text-ink-muted">자치회 글의 댓글·엄지척에는 포인트가 없어요.</p>
        )}
      </div>
    </>
  );
}
