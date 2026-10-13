import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMql(): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

/** 기기 설정 "움직임 줄이기" 를 따른다 (01-spec 6.4) */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => getMql()?.matches ?? false);
  useEffect(() => {
    const mq = getMql();
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** 숫자가 0 에서 target 까지 올라간다 (6.4 #2: 800ms, easeOutCubic, 1회). 움직임 줄이기면 바로 최종값 */
export function useCountUp(target: number, duration = 800): number {
  const reduced = usePrefersReducedMotion();
  const animate = !reduced && typeof requestAnimationFrame !== 'undefined';
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, animate]);
  return animate ? value : target;
}
