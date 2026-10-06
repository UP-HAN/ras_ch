import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { TeacherUser } from '@server-types/api';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { Button, Input, Modal } from '@/components/ui';

/** 자주 쓰는 직책 (CNC-03). 직접 적을 수도 있다 */
const TITLES = ['회장', '부회장', '서기', '학급대표', '부원'];

/**
 * 담임이 자기 반 학생을 자치회 임원으로 지정한다 (CNC-03).
 * 임원이 되면 자치회 글을 쓸 수 있고, 글 옆에 직책이 표시된다.
 */
export function CouncilModal({
  student,
  onClose,
  onSaved,
}: {
  student: TeacherUser;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('학급대표');
  const [termStart, setTermStart] = useState(today);
  const [termEnd, setTermEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      teacherApi.setCouncil(student.id, {
        title: title.trim(),
        termStart,
        termEnd: termEnd.trim() === '' ? null : termEnd,
      }),
    onSuccess: (m) => onSaved(`${student.name} 학생을 ${m.title}(으)로 지정했어요.`),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };

  return (
    <Modal title={`${student.name} 자치회 임원 지정`} onClose={onClose} testId="council-modal">
      <form onSubmit={submit} className="space-y-3 text-base">
        <fieldset>
          <legend className="mb-1 font-semibold">직책</legend>
          <div className="mb-2 flex flex-wrap gap-1">
            {TITLES.map((t) => (
              <Button
                key={t}
                type="button"
                variant={title === t ? 'primary' : 'secondary'}
                aria-pressed={title === t}
                onClick={() => setTitle(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <Input
            label="직접 적기"
            value={title}
            maxLength={20}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Input
            label="임기 시작"
            type="date"
            required
            value={termStart}
            onChange={(e) => setTermStart(e.target.value)}
            className="flex-1"
          />
          <Input
            label="임기 끝 (비우면 계속)"
            type="date"
            value={termEnd}
            onChange={(e) => setTermEnd(e.target.value)}
            className="flex-1"
          />
        </div>
        {error && (
          <p role="alert" className="font-medium text-danger-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button type="submit" loading={save.isPending}>
            지정하기
          </Button>
        </div>
      </form>
    </Modal>
  );
}
