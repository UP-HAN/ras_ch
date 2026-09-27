import { useEffect, type ReactNode } from 'react';
import { Card } from './Card';

/**
 * 공통 모달 (QA #13): Escape 키·배경 클릭으로 닫힌다. 본문은 Card 로 감싼다.
 */
export function Modal({
  title,
  onClose,
  children,
  action,
  className = 'max-w-md',
  testId,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-accent-900/40 p-4"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
    >
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <Card title={title} action={action} className={`relative w-full ${className}`}>
        {children}
      </Card>
    </div>
  );
}
