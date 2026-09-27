import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

/**
 * 파괴적 동작 확인 모달 (QA #1). window.confirm 대신 쓴다.
 *  - requireText: 이 글자를 그대로 입력해야 실행 버튼이 켜진다 (예: 반 이름 "6-1")
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '실행',
  danger = false,
  requireText,
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = !requireText || typed.trim() === requireText;
  return (
    <Modal title={title} onClose={onCancel} testId="confirm-dialog">
      <div className="space-y-3 text-base">
        {typeof message === 'string' ? <p>{message}</p> : message}
        {requireText && (
          <Input
            label={`확인을 위해 "${requireText}" 를 그대로 입력하세요`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            data-testid="confirm-text"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            취소
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!ready}
            loading={loading}
            data-testid="confirm-ok"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
