import type { TeacherUser } from '@server-types/api';
import { useState } from 'react';
import { adminApi } from '@/api/admin';
import { errorMessage } from '@/api/client';
import { Button, Card } from '@/components/ui';

type Status = 'active' | 'transferred' | 'graduated' | 'disabled';

/** PATCH /admin/students/:id — 학부모 동의(AUTH-08/09)·기자단(ART-07)·상태(3.1) */
export function StudentEditModal({
  student,
  onClose,
  onSaved,
}: {
  student: TeacherUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [consent, setConsent] = useState<'Y' | 'N'>(student.parentConsent);
  const [reporter, setReporter] = useState(student.isReporter);
  const [status, setStatus] = useState<Status>(student.status as Status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateStudent(student.id, {
        parentConsent: consent,
        isReporter: reporter,
        status,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-accent-900/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card
        title={`${student.name} (${student.className} ${student.studentNo}번)`}
        className="w-full max-w-md"
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-base font-semibold">
              학부모 동의(캡처 이미지 업로드)
            </legend>
            <div className="flex gap-2">
              {(['Y', 'N'] as const).map((v) => (
                <Button
                  key={v}
                  variant={consent === v ? 'primary' : 'secondary'}
                  onClick={() => setConsent(v)}
                >
                  {v === 'Y' ? '동의' : '미동의'}
                </Button>
              ))}
            </div>
            {student.parentConsent === 'Y' && consent === 'N' && (
              <p className="mt-1 text-base text-warn-600">
                철회하면 이 학생의 캡처 이미지는 30일 뒤 삭제 대기 목록에 올라가요.
              </p>
            )}
          </fieldset>
          <label className="flex min-h-tap items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={reporter}
              onChange={(e) => setReporter(e.target.checked)}
            />
            기자단 배지
          </label>
          <label className="block text-base">
            <span className="mb-1 block font-semibold">상태</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="min-h-tap w-full rounded-md border-2 border-line-strong bg-surface px-3 text-base"
            >
              <option value="active">재학</option>
              <option value="transferred">전출</option>
              <option value="graduated">졸업</option>
              <option value="disabled">중지(로그인 불가)</option>
            </select>
          </label>
          {error && (
            <p role="alert" className="text-base font-medium text-danger-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button onClick={save} loading={busy}>
              저장
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
