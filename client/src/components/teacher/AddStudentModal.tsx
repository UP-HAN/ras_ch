import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { ClassView, ImportResult } from '@server-types/api';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { Button, Input, Modal } from '@/components/ui';

/**
 * 담임·배정 교사가 자기 반에 학생 한 명을 추가한다 (2026-10-06 사용자 요청).
 * 전학 온 학생처럼 CSV 를 다시 올리기 어려운 경우에 쓴다. 다른 반은 서버가 403 으로 막는다.
 */
export function AddStudentModal({
  klass,
  nextNo,
  onClose,
  onAdded,
}: {
  klass: ClassView;
  /** 비어 있는 다음 번호 추천값 */
  nextNo: number;
  onClose: () => void;
  onAdded: (r: ImportResult) => void;
}) {
  const [studentNo, setStudentNo] = useState(String(nextNo));
  const [name, setName] = useState('');
  const [parentConsent, setParentConsent] = useState<'Y' | 'N'>('Y');
  const [isReporter, setIsReporter] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      teacherApi.addStudent(klass.id, {
        studentNo: Number(studentNo),
        name: name.trim(),
        parentConsent,
        isReporter,
        initialPassword: password.trim() === '' ? null : password.trim(),
      }),
    onSuccess: onAdded,
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    add.mutate();
  };

  return (
    <Modal title={`${klass.name} 학생 추가`} onClose={onClose} testId="add-student-modal">
      <form onSubmit={submit} className="space-y-3 text-base">
        <p className="text-ink-muted">
          전학 온 학생처럼 한 명만 넣을 때 써요. 아이디는 번호에 맞춰 자동으로 만들어져요.
        </p>
        <div className="flex gap-2">
          <Input
            label="번호"
            type="number"
            min={1}
            max={99}
            required
            value={studentNo}
            onChange={(e) => setStudentNo(e.target.value)}
            className="w-28"
          />
          <Input
            label="이름"
            required
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
            placeholder="예) 김초롱"
          />
        </div>
        <Input
          label="초기 비밀번호 (비우면 자동으로 만들어요)"
          value={password}
          maxLength={64}
          onChange={(e) => setPassword(e.target.value)}
          hint="학생은 첫 로그인 때 새 비밀번호로 바꾸게 돼요."
        />
        <fieldset>
          <legend className="mb-1 font-semibold">학부모 동의</legend>
          <div className="flex gap-1">
            {(['Y', 'N'] as const).map((v) => (
              <Button
                key={v}
                type="button"
                variant={parentConsent === v ? 'primary' : 'secondary'}
                aria-pressed={parentConsent === v}
                onClick={() => setParentConsent(v)}
              >
                {v === 'Y' ? '동의함' : '동의 안 함'}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-ink-muted">
            동의하지 않으면 사진을 올리는 리포트는 쓸 수 없고 일기형만 쓸 수 있어요.
          </p>
        </fieldset>
        <label className="flex min-h-tap items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={isReporter}
            onChange={(e) => setIsReporter(e.target.checked)}
          />
          기자단으로 지정
        </label>
        {error && (
          <p role="alert" className="font-medium text-danger-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={add.isPending}>
            취소
          </Button>
          <Button type="submit" loading={add.isPending}>
            추가하기
          </Button>
        </div>
      </form>
    </Modal>
  );
}
