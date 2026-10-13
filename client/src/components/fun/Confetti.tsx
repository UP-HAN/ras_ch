import type { CSSProperties } from 'react';

/** 6색: 초록 계열 중심 + 작은 포인트(노랑·하늘·분홍·보라) */
const COLORS = ['#4ea83a', '#ffd84d', '#3ccf9a', '#4fb3ff', '#ff6fa3', '#9a7bff'];
const COUNT = 16;

/** 고정된 퍼짐 값(렌더할 때마다 같은 모양) */
const PIECES = Array.from({ length: COUNT }, (_, i) => {
  const angle = (i / COUNT) * Math.PI * 2;
  return {
    color: COLORS[i % COLORS.length] as string,
    dx: Math.round(Math.cos(angle) * (90 + (i % 3) * 30)),
    dy: Math.round(140 + Math.abs(Math.sin(angle)) * 90 + (i % 4) * 15),
    delay: (i % 5) * 40,
    round: i % 2 === 0,
  };
});

/**
 * 색종이 16조각 (6.4 #3): 위에서 퍼지며 떨어지고 360deg 회전. 1200ms 1회.
 * 움직임 줄이기면 CSS 가 숨긴다(motion.css).
 */
export function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-6 flex justify-center"
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`anim-confetti absolute block h-3 w-2.5 ${p.round ? 'rounded-full' : 'rounded-[3px]'}`}
          style={
            {
              backgroundColor: p.color,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--delay': `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
