import { useEffect, useId, useMemo } from 'react';
import { cn } from '@/lib/cn';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 캡처 1장 선택 (RPT-02): jpg/png/webp, 5MB 이하. 미리보기·교체·기존 이미지 표시.
 */
export function ImagePicker({
  label,
  hint,
  existingUrl,
  file,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  existingUrl?: string | null;
  file: File | null;
  onChange: (file: File | null, error: string | null) => void;
  error?: string | null;
}) {
  const id = useId();
  // 미리보기 URL 은 파일에서 파생. 바뀌거나 사라질 때 이전 URL 을 해제한다
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return onChange(null, null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
      return onChange(null, 'jpg, png, webp 사진만 올릴 수 있어요.');
    if (f.size > MAX_BYTES) return onChange(null, '사진이 너무 커요. 5MB 이하로 올려 주세요.');
    onChange(f, null);
  };

  const shown = preview ?? existingUrl ?? null;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-base font-semibold">
        {label}
      </label>
      <div
        className={cn(
          'rounded-lg border-2 border-dashed p-2',
          error ? 'border-danger-600' : 'border-line-strong bg-surface',
        )}
      >
        {shown ? (
          <img
            src={shown}
            alt={`${label} 미리보기`}
            className="mx-auto max-h-72 rounded-md object-contain"
          />
        ) : (
          <p className="py-6 text-center text-base text-ink-muted">아직 사진이 없어요</p>
        )}
        <label
          htmlFor={id}
          className="mt-2 flex min-h-tap cursor-pointer items-center justify-center rounded-md bg-primary-100 text-base font-semibold text-primary-800"
        >
          {shown ? '다른 사진으로 바꾸기' : '사진 고르기'}
        </label>
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-base font-medium text-danger-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-base text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
