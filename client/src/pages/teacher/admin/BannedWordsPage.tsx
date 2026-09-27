import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BannedWordView } from '@server-types/api';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/api/client';
import { teacherCommentsApi } from '@/api/teacherComments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/components/ui';

/** 금칙어 관리 (RCT-04, ADM-02): 추가(빈 값·중복 검사)·끄기/켜기·삭제(확인 모달) — QA #9 */
export function BannedWordsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'banned-words'],
    queryFn: teacherCommentsApi.bannedWords,
  });
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BannedWordView | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'banned-words'] });
  const add = useMutation({
    mutationFn: () => teacherCommentsApi.addBannedWord(word.trim()),
    onSuccess: () => {
      setWord('');
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: number; on: boolean }) =>
      teacherCommentsApi.setBannedWordActive(v.id, v.on),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => teacherCommentsApi.deleteBannedWord(id),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: (e) => {
      setDeleting(null);
      setError(errorMessage(e));
    },
  });

  const trimmed = word.trim();
  const duplicate = q.data?.find((w) => w.word.toLowerCase() === trimmed.toLowerCase());
  const inlineError = !trimmed
    ? error
    : duplicate
      ? duplicate.isActive
        ? '이미 등록된 금칙어예요.'
        : '이미 있는 말이에요(꺼짐). 아래에서 "켜기"를 눌러 주세요.'
      : error;
  const canAdd = trimmed.length > 0 && !duplicate;

  return (
    <>
      <PageHeader
        title="금칙어"
        description="댓글에 이 말이 들어가면 등록되지 않아요. 띄어쓰기·기호로 피해 가도 잡아요."
      />
      <Card>
        <form
          className="mb-4 flex items-start gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!canAdd) {
              if (!trimmed) setError('금칙어를 적어 주세요.');
              return;
            }
            add.mutate();
          }}
        >
          <Input
            label="새 금칙어"
            value={word}
            onChange={(e) => {
              setWord(e.target.value);
              setError(null);
            }}
            maxLength={50}
            className="w-64"
            error={inlineError ?? undefined}
          />
          <Button type="submit" loading={add.isPending} disabled={!canAdd} className="mt-7">
            추가
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {q.data?.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1"
              data-testid={`banned-${w.id}`}
            >
              <span className={w.isActive ? 'font-semibold' : 'text-ink-muted line-through'}>
                {w.word}
              </span>
              {!w.isActive && <Badge tone="neutral">꺼짐</Badge>}
              <button
                type="button"
                onClick={() => toggle.mutate({ id: w.id, on: !w.isActive })}
                className="min-h-tap px-2 text-base text-info-600 underline"
              >
                {w.isActive ? '끄기' : '켜기'}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(w)}
                aria-label={`${w.word} 삭제`}
                className="min-h-tap px-2 text-base text-danger-600 underline"
              >
                삭제
              </button>
            </li>
          ))}
          {q.data?.length === 0 && (
            <li className="text-base text-ink-muted">등록된 금칙어가 없어요.</li>
          )}
        </ul>
      </Card>
      {deleting && (
        <ConfirmDialog
          title="금칙어 삭제"
          message={`"${deleting.word}" 를 목록에서 완전히 지울까요? 잠시 쓰지 않으려면 "끄기"로도 충분해요.`}
          confirmLabel="삭제"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
