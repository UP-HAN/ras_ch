import { cn } from '@/lib/cn';

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const px =
    size === 'sm'
      ? 'h-5 w-5 border-2'
      : size === 'lg'
        ? 'h-10 w-10 border-4'
        : 'h-7 w-7 border-[3px]';
  return (
    <span
      role="status"
      aria-label="불러오는 중"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        px,
        className,
      )}
    />
  );
}
