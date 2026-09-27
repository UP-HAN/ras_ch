import type { TeacherUser } from '@server-types/api';
import { useState } from 'react';
import { adminApi } from '@/api/admin';
import { errorMessage } from '@/api/client';
import { Button, ConfirmDialog, Modal } from '@/components/ui';

type Status = 'active' | 'transferred' | 'graduated' | 'disabled';

/** PATCH /admin/students/:id — 학부모 동의(AUTH-08/09)·기자단(ART-07)·상태(3.1). 계정 삭제는 확인 모달 (QA #1) */
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteUser(student.id);
      onSaved();
    } catch (e) {
      setConfirmDelete(false);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

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
    <>
      <Modal
        title={`${student.name} (${student.className} ${student.studentNo}번)`}
        onClose={onClose}
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
                  aria-pressed={consent === v}
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
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-base text-ink-muted">
              계정 삭제는 활동 기록이 없는 학생만 가능해요. 기록이 있으면 상태를 “중지”로 바꿔
              주세요.
            </p>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              계정 삭제
            </Button>
          </div>
        </div>
      </Modal>
      {confirmDelete && (
        <ConfirmDialog
          title="계정 삭제"
          message={`${student.name} 학생 계정을 지울까요? 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          danger
          loading={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
