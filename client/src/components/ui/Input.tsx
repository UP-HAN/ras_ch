import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  /** 무엇을 어떻게 고치면 되는지 형태의 오류 문구 */
  error?: string;
  hint?: string;
}

const FIELD_BASE =
  'w-full rounded-md border-2 bg-surface px-3 text-base text-ink placeholder:text-ink-muted focus:border-info-600 focus:outline-none disabled:bg-primary-50';

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-base font-semibold">
      {children}
    </label>
  );
}

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1 text-base font-medium text-danger-600">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1 text-base text-ink-muted">
        {hint}
      </p>
    );
  }
  return null;
}

export type InputProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  return (
    <div className={className}>
      <Label htmlFor={inputId}>{label}</Label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? helpId : undefined}
        className={cn(FIELD_BASE, 'min-h-tap', error ? 'border-danger-600' : 'border-line-strong')}
        {...rest}
      />
      <Help id={helpId} error={error} hint={hint} />
    </div>
  );
});

export type TextareaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, rows = 5, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  return (
    <div className={className}>
      <Label htmlFor={inputId}>{label}</Label>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? helpId : undefined}
        className={cn(
          FIELD_BASE,
          'py-2 leading-relaxed',
          error ? 'border-danger-600' : 'border-line-strong',
        )}
        {...rest}
      />
      <Help id={helpId} error={error} hint={hint} />
    </div>
  );
});
