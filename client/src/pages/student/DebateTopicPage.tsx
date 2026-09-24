import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewsVoteSide } from '@server-types/api';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { newsApi } from '@/api/news';
import { PageHeader } from '@/components/layout/PageHeader';
import { TOPIC_TYPE_LABEL } from '@/components/news/topicLabels';
import { VoteBar } from '@/components/news/VoteBar';
import { ReactionsSection } from '@/components/post/Reactions';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useReadTracker } from '@/hooks/useReadTracker';

/** 토론 주제 상세 (NWS-06, 07, 08, 10): 설명·질문·투표·비율·의견 댓글(도우미·입장 배지)·베스트 의견 */
export function DebateTopicPage() {
  const { id } = useParams();
  const topicId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['news', 'topic', topicId],
    queryFn: () => newsApi.get(topicId),
    enabled: Number.isInteger(topicId),
  });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const vote = useMutation({
    mutationFn: (side: NewsVoteSide) => newsApi.vote(topicId, side),
    onSuccess: (r) => {
      setFlash(r.granted ? '투표했어요! +1P' : '투표를 바꿨어요.');
      void qc.invalidateQueries({ queryKey: ['news'] });
      void qc.invalidateQueries({ queryKey: ['reactions', 'news_topic', topicId] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  useReadTracker(q.data ? { type: 'news_topic', id: topicId } : null, !!q.data);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!q.data) {
    return (
      <EmptyState
        icon="🙈"
        title="토론 주제를 찾을 수 없어요"
        action={<Button onClick={() => navigate('/debate')}>토론방으로</Button>}
      />
    );
  }
  const t = q.data;
  const closed = t.status === 'closed';

  return (
    <>
      <PageHeader
        title={t.title}
        action={<Badge tone={closed ? 'neutral' : 'success'}>{closed ? '마감' : '진행 중'}</Badge>}
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={t.type === 'vote' ? 'primary' : 'info'}>{TOPIC_TYPE_LABEL[t.type]}</Badge>
          {t.tags.map((tag) => (
            <Badge key={tag} tone="neutral">
              #{tag}
            </Badge>
          ))}
          {t.closeAt && (
            <span className="ml-auto text-base text-ink-muted">
              {closed ? '마감' : '마감'} {new Date(t.closeAt).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>

        <Card>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{t.body}</p>
          {t.sourceUrl && (
            <a
              href={t.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-tap items-center text-base text-info-600 underline"
            >
              🔗 출처 보기
            </a>
          )}
        </Card>

        <Card tone="primary" title="생각 열기">
          <ol className="list-decimal space-y-1 pl-5 text-base">
            {t.questions.map((qs) => (
              <li key={qs}>{qs}</li>
            ))}
          </ol>
        </Card>

        {t.type === 'vote' && (
          <Card title={closed ? '투표 결과' : '나는 어느 쪽?'} data-testid="vote-card">
            {t.canVote && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  variant={t.myVote === 'agree' ? 'primary' : 'secondary'}
                  loading={vote.isPending && vote.variables === 'agree'}
                  onClick={() => vote.mutate('agree')}
                  aria-pressed={t.myVote === 'agree'}
                >
                  👍 찬성
                </Button>
                <Button
                  size="lg"
                  variant={t.myVote === 'disagree' ? 'danger' : 'secondary'}
                  loading={vote.isPending && vote.variables === 'disagree'}
                  onClick={() => vote.mutate('disagree')}
                  aria-pressed={t.myVote === 'disagree'}
                >
                  👎 반대
                </Button>
              </div>
            )}
            {t.myVote || closed || !t.canVote ? (
              <VoteBar votes={t.votes} />
            ) : (
              <p className="text-base text-ink-muted">투표하면 지금까지의 비율이 보여요.</p>
            )}
            {t.myVote && !closed && (
              <p className="mt-2 text-base text-ink-muted">
                마감 전까지 마음이 바뀌면 다시 누를 수 있어요.
              </p>
            )}
            {flash && <p className="mt-2 text-base text-success-600">{flash}</p>}
            {error && (
              <p role="alert" className="mt-2 text-base font-medium text-danger-600">
                {error}
              </p>
            )}
          </Card>
        )}

        {closed && t.bestOpinions.length > 0 && (
          <Card tone="accent" title="🏅 베스트 의견">
            <ul className="space-y-2">
              {t.bestOpinions.map((c) => (
                <li key={c.id} className="rounded-md bg-surface p-3">
                  <p className="text-base font-semibold">
                    {c.author.className} {c.author.displayName}
                    {c.stance && (
                      <Badge tone={c.stance === 'agree' ? 'success' : 'danger'} className="ml-2">
                        {c.stance === 'agree' ? '찬성' : '반대'}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-base">{c.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ReactionsSection
          target={{ type: 'news_topic', id: topicId }}
          isMine={false}
          showLike={false}
          canComment={t.canComment}
          closedText={closed ? '마감된 토론이에요. 의견을 읽을 수만 있어요.' : undefined}
          helpers={t.helpers}
          title="의견"
        />
      </div>
    </>
  );
}
