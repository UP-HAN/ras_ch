import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** 가로로 꽉 채우기 */
  block?: boolean;
}

/** 통통한 "젤리" 버튼 (01-spec 6.3): 아래 그림자가 있고, 누르면 2px 내려가며 그림자가 줄어든다(6.4 #13) */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white shadow-[var(--shadow-pop)] hover:bg-primary-700 active:shadow-[0_2px_0_var(--color-primary-800)] disabled:bg-primary-300 disabled:shadow-none',
  secondary:
    'bg-surface text-primary-700 border-2 border-primary-300 shadow-[var(--shadow-pop-soft)] hover:bg-primary-50 active:bg-primary-100 active:shadow-[0_1px_0_var(--color-primary-200)] disabled:text-ink-muted disabled:border-line disabled:shadow-none',
  ghost:
    'bg-transparent text-ink hover:bg-primary-50 active:bg-primary-100 disabled:text-ink-muted',
  danger:
    'bg-danger-600 text-white shadow-[0_4px_0_#7f1d1d] hover:bg-red-800 active:shadow-[0_2px_0_#7f1d1d] disabled:bg-red-300 disabled:shadow-none',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-tap px-4 text-base',
  lg: 'min-h-14 px-5 text-lg',
};

/** 버튼: 높이 44px 이상, 글자 16px 이상 (PRD 10장) */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'anim-press inline-flex items-center justify-center gap-2 rounded-lg font-bold select-none',
        'disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});
