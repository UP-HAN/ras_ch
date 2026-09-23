import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentView } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { reactionsApi } from '@/api/reactions';
import { Button, Card, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

const COMMENT_MIN = 10;
const COMMENT_MAX = 300;
const PER_POST = 3;

/** 좋아요 버튼 (RCT-01): 1회, 취소 가능 */
export function LikeButton({
  liked,
  count,
  onToggle,
  busy,
  small,
}: {
  liked: boolean;
  count: number;
  onToggle: () => void;
  busy?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={liked}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-tap items-center gap-1 rounded-full border-2 px-4 font-bold',
        liked
          ? 'border-primary-600 bg-primary-100 text-primary-800'
          : 'border-line-strong bg-surface text-ink',
        small ? 'text-base' : 'text-lg',
      )}
    >
      👍 {liked ? '엄지척!' : '엄지척'} <span className="text-ink-muted">{count}</span>
    </button>
  );
}

/** 신고 (RCT-05): 이유 입력 → 1인 1회 */
export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'post' | 'comment';
  targetId: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => reactionsApi.report(targetType, targetId, reason),
    onSuccess: (r) => {
      setMsg(
        r.autoHidden
          ? '신고했어요. 여러 친구가 신고해서 글이 숨겨졌어요.'
          : '신고했어요. 선생님이 확인할 거예요.',
      );
      setOpen(false);
    },
    onError: (e) => setMsg(errorMessage(e)),
  });
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-tap px-2 text-base text-ink-muted underline"
      >
        🚩 신고
      </button>
      {open && (
        <span className="mt-1 flex flex-col gap-1 rounded-md bg-surface p-2 shadow-card">
          <input
            aria-label="신고 이유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="왜 신고하나요? (예: 나쁜 말)"
            className="min-h-tap rounded-md border-2 border-line-strong px-3 text-base"
            maxLength={200}
          />
          <span className="flex gap-1">
            <Button
              variant="danger"
              disabled={reason.trim().length < 2}
              loading={m.isPending}
              onClick={() => m.mutate()}
            >
              보내기
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
          </span>
        </span>
      )}
      {msg && <span className="mt-1 text-base text-ink-muted">{msg}</span>}
    </span>
  );
}

/** 상세 하단: 좋아요 + 댓글 목록 + 댓글 쓰기 (RCT-01~04, RCT-07 좋은 댓글 기준) */
export function ReactionsSection({ postId, isMine }: { postId: number; isMine: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['reactions', postId],
    queryFn: () => reactionsApi.reactions(postId),
  });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['reactions', postId] });
    void qc.invalidateQueries({ queryKey: ['posts'] });
  };
  const like = useMutation({
    mutationFn: (on: boolean) => reactionsApi.likePost(postId, on),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const likeComment = useMutation({
    mutationFn: (v: { id: number; on: boolean }) => reactionsApi.likeComment(v.id, v.on),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: () => reactionsApi.addComment(postId, text),
    onSuccess: () => {
      setText('');
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: number) => reactionsApi.deleteComment(id),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  if (!q.data) return null;
  const { likedByMe, likeCount, comments, myCommentCount, goodCommentGuide } = q.data;
  const len = Array.from(text.trim()).length;
  const canWrite = myCommentCount < PER_POST;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <LikeButton
          liked={likedByMe}
          count={likeCount}
          busy={like.isPending}
          onToggle={() => like.mutate(!likedByMe)}
        />
        {!isMine && <ReportButton targetType="post" targetId={postId} />}
        {isMine && (
          <span className="text-base text-ink-muted">내 글에 누른 엄지척은 포인트가 없어요</span>
        )}
      </div>

      <Card title={`댓글 ${comments.length}`}>
        {goodCommentGuide && (
          <p className="mb-3 rounded-md bg-info-50 px-3 py-2 text-base text-info-600">
            💡 {goodCommentGuide}
          </p>
        )}
        <ul className="space-y-3">
          {comments.map((c: CommentView) => (
            <li key={c.id} className="rounded-md bg-paper p-3">
              <p className="text-base font-semibold">
                {c.author.className} {c.author.displayName}
                {c.author.isReporter && <span className="ml-1 text-info-600">기자단</span>}
                <span className="ml-2 text-ink-muted">
                  {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base">{c.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <LikeButton
                  small
                  liked={c.likedByMe}
                  count={c.likeCount}
                  busy={likeComment.isPending}
                  onToggle={() => likeComment.mutate({ id: c.id, on: !c.likedByMe })}
                />
                {c.isMine ? (
                  <button
                    type="button"
                    onClick={() => window.confirm('댓글을 지울까요?') && del.mutate(c.id)}
                    className="min-h-tap px-2 text-base text-ink-muted underline"
                  >
                    지우기
                  </button>
                ) : (
                  <ReportButton targetType="comment" targetId={c.id} />
                )}
              </div>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-base text-ink-muted">첫 댓글을 남겨 볼까요?</li>
          )}
        </ul>

        <div className="mt-4">
          {canWrite ? (
            <>
              <Textarea
                label="댓글 쓰기"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={COMMENT_MAX}
                hint={`${len} / ${COMMENT_MIN}자 이상 ${COMMENT_MAX}자 이하 · 한 글에 ${PER_POST}개까지`}
                error={error ?? undefined}
              />
              <Button
                className="mt-2"
                disabled={len < COMMENT_MIN}
                loading={add.isPending}
                onClick={() => add.mutate()}
              >
                댓글 달기
              </Button>
            </>
          ) : (
            <p className="text-base text-ink-muted">이 글에는 댓글을 {PER_POST}개 다 썼어요.</p>
          )}
          {error && !canWrite && (
            <p role="alert" className="mt-1 text-base text-danger-600">
              {error}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
