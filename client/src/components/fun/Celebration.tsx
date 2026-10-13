import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/motion';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';

/**
 * 포인트 축하 창 (6.4 #3): 가운데 흰 카드 pop-in + 초롱이 통통 + 색종이 16조각.
 * 3000ms 뒤 저절로 닫히고, 화면을 누르거나 "좋아요" 를 누르면 바로 닫힌다.
 */
export function Celebration({ points, onClose }: { points: number; onClose: () => void }) {
  const reduced = usePrefersReducedMotion();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const t = window.setTimeout(() => closeRef.current(), 3000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      data-testid="celebration"
      className="fixed inset-0 z-40 flex items-center justify-center bg-accent-900/50 p-4"
      onClick={onClose}
    >
      <div className="anim-pop-in relative w-full max-w-xs overflow-visible rounded-xl border-2 border-primary-300 bg-surface px-5 pb-5 pt-4 text-center shadow-card">
        {!reduced && <Confetti />}
        <Mascot
          name="cheer"
          size={160}
          className="anim-hop mx-auto"
          fallback={<p className="text-6xl">🎉</p>}
        />
        <p
          id="celebration-title"
          className="mt-2 font-display text-2xl text-primary-700"
          aria-live="polite"
        >
          +{points}P 받았어요!
        </p>
        <p className="mt-1 text-base text-ink-muted">정말 잘했어요. 계속 해 봐요!</p>
        <button
          ref={okRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // 바깥 화면 클릭과 겹쳐 두 번 닫히지 않게
            onClose();
          }}
          className="anim-press mt-4 inline-flex min-h-tap w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-base font-bold text-white shadow-[var(--shadow-pop)] active:shadow-[0_2px_0_var(--color-primary-800)]"
        >
          좋아요
        </button>
      </div>
    </div>
  );
}
