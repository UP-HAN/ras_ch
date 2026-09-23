import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { reviewApi } from '@/api/review';
import { PageHeader } from '@/components/layout/PageHeader';
import { tagLabel, typeLabel } from '@/components/post/articleMeta';
import { minutesLabel, UsageDiff } from '@/components/post/UsageDiff';
import { Badge, Button, Card, EmptyState, Spinner, Textarea } from '@/components/ui';
import { HOLD_NOTE_MIN, POST_TYPE_LABEL } from '@/lib/reviewLabels';

/**
 * 검토 화면 (APR-02c, 02d, 03, 04):
 *  - 작성자 정보 없음(서버가 제거). 이미지 상단 10% 는 마스크로 가린다(기기 이름·계정 노출 방지)
 *  - 체크리스트 전부 확인해야 "통과". 하나라도 아니면 "보류 요청"(사유 20자 이상)
 */
export function ReviewPostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['review', 'summary'], queryFn: reviewApi.summary });
  const q = useQuery({
    queryKey: ['review', 'post', postId],
    queryFn: () => reviewApi.post(postId),
    enabled: Number.isInteger(postId),
  });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'check' | 'hold'>('check');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (result: 'pass' | 'hold') =>
      reviewApi.submit(postId, { result, checklist: checked, note: note.trim() || undefined }),
    onSuccess: (r, result) => {
      void qc.invalidateQueries({ queryKey: ['review'] });
      navigate('/review', {
        replace: true,
        state: {
          message:
            result === 'pass'
              ? r.autoApproved
                ? '통과했어요. 바로 게시됐어요.'
                : '통과했어요. 선생님이 마지막으로 확인해요.'
              : '보류 요청을 보냈어요. 선생님이 확인해요.',
        },
      });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (q.isLoading || summary.isLoading) {
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
        title="검토할 수 없는 글이에요"
        description="이미 검토됐거나 내가 검토할 수 없는 글이에요."
        action={<Button onClick={() => navigate('/review')}>목록으로</Button>}
      />
    );
  }
  const p = q.data;
  const allChecked = p.checklist.every((c) => checked[c.code] === true);
  const canHold = summary.data?.allowedResults === 'pass_hold';
  const noteLen = Array.from(note.trim()).length;

  return (
    <>
      <PageHeader
        title={`${p.authorGrade}학년 학생의 ${POST_TYPE_LABEL[p.type] ?? '글'}`}
        description="누가 썼는지는 알 수 없어요. 체크리스트만 확인해요."
        action={<Badge tone="info">{p.weekKey ?? '기사'}</Badge>}
      />
      <div className="space-y-4">
        {p.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {p.images.map((img) => (
              <figure
                key={img.id}
                className="relative overflow-hidden rounded-md border border-line"
              >
                <img
                  src={img.url}
                  alt="캡처"
                  width={img.width}
                  height={img.height}
                  loading="lazy"
                  className="w-full object-contain"
                />
                {/* APR-02d: 상단 10% 마스크 (기기 이름·계정 정보 영역) */}
                <div
                  aria-hidden="true"
                  data-testid="image-mask"
                  className="absolute inset-x-0 top-0 h-[10%] bg-ink/90"
                />
              </figure>
            ))}
          </div>
        )}

        {p.report && (
          <Card>
            <dl className="grid grid-cols-2 gap-y-2 text-base">
              <dt className="text-ink-muted">하루 평균</dt>
              <dd className="font-bold">{minutesLabel(p.report.avgMinutesPerDay)}</dd>
              <dt className="text-ink-muted">지난주 대비</dt>
              <dd>
                <UsageDiff
                  avg={p.report.avgMinutesPerDay}
                  prev={p.report.prevAvgMinutes}
                  diff={p.report.diffMinutes}
                />
              </dd>
              {p.report.topCategory && (
                <>
                  <dt className="text-ink-muted">많이 쓴 종류</dt>
                  <dd>{p.report.topCategory}</dd>
                </>
              )}
              {p.report.topApp && (
                <>
                  <dt className="text-ink-muted">많이 쓴 앱</dt>
                  <dd>{p.report.topApp}</dd>
                </>
              )}
            </dl>
          </Card>
        )}

        {p.type === 'article' && (
          <div>
            <h2 className="text-2xl font-extrabold">{p.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.article?.tags.map((t) => (
                <Badge key={t} tone="primary">
                  {tagLabel(t)}
                </Badge>
              ))}
              {p.article && <Badge tone="neutral">{typeLabel(p.article.articleType)}</Badge>}
            </div>
          </div>
        )}

        <Card title={p.type === 'article' ? '본문' : '이번 주 나의 폰 습관'}>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{p.body}</p>
          <p className="mt-2 text-base text-ink-muted">{Array.from(p.body).length}자</p>
        </Card>
        {p.goalText && (
          <Card tone="primary" title="다음 주 목표">
            <p className="text-lg font-bold">🎯 {p.goalText}</p>
          </Card>
        )}
        {p.article?.oneLine && (
          <Card tone="primary" title="한 줄 소감">
            <p className="text-lg font-bold">💬 {p.article.oneLine}</p>
          </Card>
        )}

        <Card title="체크리스트">
          <ul className="space-y-1">
            {p.checklist.map((c) => (
              <li key={c.code}>
                <label className="flex min-h-tap items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    className="h-6 w-6"
                    checked={checked[c.code] === true}
                    onChange={(e) => setChecked((s) => ({ ...s, [c.code]: e.target.checked }))}
                  />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-2 text-base font-medium text-danger-600">
              {error}
            </p>
          )}

          {mode === 'check' ? (
            <div className="mt-4 space-y-2">
              <Button
                block
                size="lg"
                disabled={!allChecked}
                loading={submit.isPending && submit.variables === 'pass'}
                onClick={() => submit.mutate('pass')}
              >
                모두 확인했어요 · 통과
              </Button>
              {canHold ? (
                <Button block variant="secondary" size="lg" onClick={() => setMode('hold')}>
                  보류 요청
                </Button>
              ) : (
                <p className="text-center text-base text-ink-muted">
                  판단이 어려우면 통과하지 말고 그대로 두세요. 선생님이 확인해요.
                </p>
              )}
              {!allChecked && (
                <p className="text-center text-base text-ink-muted">
                  체크리스트를 모두 확인하면 통과할 수 있어요.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-base font-semibold">왜 보류하는지 골라 주세요</p>
              <div className="flex flex-wrap gap-2">
                {summary.data?.holdReasons.map((r) => (
                  <Button
                    key={r.code}
                    variant={note === r.text ? 'primary' : 'secondary'}
                    onClick={() => setNote(r.text)}
                  >
                    {r.code === 'privacy'
                      ? '개인정보 보임'
                      : r.code === 'capture'
                        ? '캡처가 달라요'
                        : r.code === 'short'
                          ? '글이 짧아요'
                          : '부적절한 내용'}
                  </Button>
                ))}
              </div>
              <Textarea
                label={`선생님에게 남길 메모 (${HOLD_NOTE_MIN}자 이상)`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                hint={`${noteLen}자`}
              />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setMode('check')}>
                  돌아가기
                </Button>
                <Button
                  className="flex-1"
                  variant="danger"
                  disabled={noteLen < HOLD_NOTE_MIN}
                  loading={submit.isPending && submit.variables === 'hold'}
                  onClick={() => submit.mutate('hold')}
                >
                  보류 요청 보내기
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
