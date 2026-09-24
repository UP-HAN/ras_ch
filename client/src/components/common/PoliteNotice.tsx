import { POLITE_RULE, politeWarning } from '@/lib/politeness';
import { cn } from '@/lib/cn';

/** 존댓말 원칙 배너 — 글쓰기·댓글 화면 상단 */
export function PoliteNotice({ className }: { className?: string }) {
  return (
    <p
      data-testid="polite-notice"
      className={cn(
        'rounded-md border border-accent-100 bg-accent-50 px-3 py-2 text-base font-semibold text-accent-700',
        className,
      )}
    >
      🙏 {POLITE_RULE} 친구에게 말하듯 "~했어요, ~해요"로 써 주세요.
    </p>
  );
}

/** 입력 중인 글에 반말이 보이면 부드럽게 알려 준다 (차단하지 않음) */
export function PoliteWarning({ text, className }: { text: string; className?: string }) {
  const w = politeWarning(text);
  if (!w) return null;
  return (
    <p
      role="status"
      data-testid="polite-warning"
      className={cn('mt-1 rounded-md bg-warn-50 px-3 py-2 text-base text-warn-600', className)}
    >
      ✍️ {w}
    </p>
  );
}
