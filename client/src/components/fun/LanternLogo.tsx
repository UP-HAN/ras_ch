import { useState } from 'react';
import { cn } from '@/lib/cn';

/** 초롱이 얼굴 로고 (2026-10-13 사용자 결정: 사이트 로고·아이콘을 초록 초롱이로) */
const LOGO_SRC = '/illustrations/logo-mascot.webp';

/**
 * 초롱 로고. 초롱이 그림을 보여 주고, 그림을 못 불러오면 SVG 등불로 대신한다.
 * 학생 헤더에서는 swing 으로 살랑 흔들린다(6.4 #12). 교사 화면은 정지.
 */
export function LanternLogo({
  size = 28,
  swing = false,
  className,
}: {
  size?: number;
  swing?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!failed)
    return (
      <img
        src={LOGO_SRC}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('shrink-0 object-contain', swing && 'anim-lantern', className)}
      />
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn('shrink-0', swing && 'anim-lantern', className)}
    >
      {/* 걸이 끈 */}
      <path d="M14 0.5v3" stroke="#123a17" strokeWidth="1.6" strokeLinecap="round" />
      {/* 위 뚜껑 */}
      <rect x="8.5" y="3" width="11" height="3.2" rx="1.4" fill="#1b5121" />
      {/* 몸통 + 안쪽 빛 */}
      <ellipse cx="14" cy="13.5" rx="9" ry="7.8" fill="#4ea83a" />
      <ellipse cx="14" cy="13.5" rx="5.6" ry="5.4" fill="#ffd84d" opacity="0.9" />
      <path
        d="M14 5.8v15.4M9.2 7.2c-1.6 4-1.6 8.6 0 12.6M18.8 7.2c1.6 4 1.6 8.6 0 12.6"
        stroke="#24682a"
        strokeWidth="1"
        fill="none"
        opacity="0.55"
      />
      {/* 아래 뚜껑 + 술 */}
      <rect x="8.5" y="20.6" width="11" height="3.2" rx="1.4" fill="#1b5121" />
      <path d="M14 23.8v3.2" stroke="#ffb400" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
