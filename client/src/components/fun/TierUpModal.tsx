import type { Tier } from '@server-types/db';
import { useEffect, useRef } from 'react';
import { TIER_META } from '@/lib/gamify';
import { Mascot } from './Mascot';

/** 뒤에서 천천히 도는 빛줄기 (12갈래) */
function Rays() {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg
      viewBox="-100 -100 200 200"
      aria-hidden="true"
      className="anim-rays pointer-events-none absolute left-1/2 -top-[34px] -ml-[130px] h-[260px] w-[260px]"
    >
      {rays.map((deg) => (
        <path
          key={deg}
          d="M0 0 L-9 -100 L9 -100 Z"
          fill={deg % 60 === 0 ? '#ffd84d' : '#bfe6a0'}
          opacity="0.55"
          transform={`rotate(${deg})`}
        />
      ))}
    </svg>
  );
}

/**
 * 등급 올라감 창 (6.4 #4): 초롱이(빛) + 등급 이모지 0.4 → 1.2 → 1 + 빛줄기 8s 회전.
 * 저절로 닫히지 않고 "좋아요" 로 닫는다.
 */
export function TierUpModal({ tier, onClose }: { tier: Tier; onClose: () => void }) {
  const m = TIER_META[tier] ?? TIER_META.seed;
  const okRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tierup-title"
      data-testid="tier-up"
      className="fixed inset-0 z-40 flex items-center justify-center bg-accent-900/50 p-4"
    >
      <div className="anim-pop-in relative w-full max-w-xs overflow-hidden rounded-xl border-2 border-primary-300 bg-surface px-5 pb-5 pt-4 text-center shadow-card">
        <Rays />
        <div className="relative">
          <Mascot name="shine" size={160} className="mx-auto" fallback={<div className="h-4" />} />
          <p className="text-5xl" aria-hidden="true">
            <span className="anim-tier-emoji">{m.emoji}</span>
          </p>
          <p id="tierup-title" className="mt-2 font-display text-2xl text-primary-700">
            {m.emoji} {m.label} 등급이 되었어요!
          </p>
          <p className="mt-1 text-base text-ink-muted">앞으로도 함께 해 봐요.</p>
          <button
            ref={okRef}
            type="button"
            onClick={onClose}
            className="anim-press mt-4 inline-flex min-h-tap w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-base font-bold text-white shadow-[var(--shadow-pop)] active:shadow-[0_2px_0_var(--color-primary-800)]"
          >
            좋아요
          </button>
        </div>
      </div>
    </div>
  );
}
