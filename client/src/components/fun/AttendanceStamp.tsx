import { cn } from '@/lib/cn';

/**
 * 출석 도장 (6.4 #5): 빨강 원형 도장 48x48. animate 면 "쾅" 하고 찍힌다(하루 1번, celebrate.checkStamp).
 */
export function AttendanceStamp({
  animate = false,
  className,
}: {
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="오늘 출석 도장을 찍었어요"
      data-testid="attendance-stamp"
      className={cn(
        'inline-block h-12 w-12 shrink-0',
        animate ? 'anim-stamp' : '-rotate-12',
        className,
      )}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="21"
          fill="rgb(255 255 255 / 0.65)"
          stroke="#b8205e"
          strokeWidth="3"
        />
        <circle
          cx="24"
          cy="24"
          r="16.5"
          fill="none"
          stroke="#b8205e"
          strokeWidth="1.5"
          strokeDasharray="2 2.5"
        />
        <text
          x="24"
          y="29.5"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fill="#b8205e"
          fontFamily="var(--font-display)"
        >
          출석
        </text>
      </svg>
    </span>
  );
}
