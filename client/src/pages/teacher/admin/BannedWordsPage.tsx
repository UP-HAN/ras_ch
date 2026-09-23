import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/api/client';
import { teacherCommentsApi } from '@/api/teacherComments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input } from '@/components/ui';

/** 금칙어 관리 (RCT-04, ADM-02) */
export function BannedWordsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'banned-words'],
    queryFn: teacherCommentsApi.bannedWords,
  });
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'banned-words'] });
  const add = useMutation({
    mutationFn: () => teacherCommentsApi.addBannedWord(word.trim()),
    onSuccess: () => {
      setWord('');
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

  return (
    <>
      <PageHeader
        title="금칙어"
        description="댓글에 이 말이 들어가면 등록되지 않아요. 띄어쓰기·기호로 피해 가도 잡아요."
      />
      <Card>
        <form
          className="mb-4 flex items-end gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (word.trim()) add.mutate();
          }}
        >
          <Input
            label="새 금칙어"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={50}
            className="w-64"
            error={error ?? undefined}
          />
          <Button type="submit" loading={add.isPending}>
            추가
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {q.data?.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1"
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
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
