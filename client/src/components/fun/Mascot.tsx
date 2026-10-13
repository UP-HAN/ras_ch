import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ILLUSTRATIONS, type IllustrationKey, type MascotKey } from '@/lib/illustrations';

/**
 * 일러스트 그림 (01-spec 3.6). 꾸밈용이라 alt="" + aria-hidden.
 * 그림 파일이 아직 없거나 못 불러오면 fallback(없으면 아무것도) 을 보여 줘서 빈 자리가 남지 않게 한다.
 */
export function Illustration({
  name,
  width,
  height,
  className,
  fallback = null,
  onMissing,
}: {
  name: IllustrationKey;
  width: number;
  height: number;
  className?: string;
  fallback?: ReactNode;
  onMissing?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={ILLUSTRATIONS[name]}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
      onError={() => {
        setFailed(true);
        onMissing?.();
      }}
    />
  );
}

/**
 * 마스코트 "초롱이" (01-spec 3.5). 흰 바탕 그림이라 흰 카드 위에 두거나 sticker(흰 원) 로 감싼다(6.2).
 *  <Mascot name="hello" size={96} />
 */
export function Mascot({
  name,
  size = 96,
  sticker = false,
  className,
  fallback = null,
}: {
  name: MascotKey;
  size?: number;
  /** 색 카드 위에 둘 때: rounded-full bg-surface p-1 흰 원 안에 넣는다 */
  sticker?: boolean;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  const img = (
    <img
      src={ILLUSTRATIONS[name]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('block shrink-0 select-none', sticker ? 'rounded-full' : className)}
      style={{ width: size, height: size }}
    />
  );
  if (!sticker) return img;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 rounded-full bg-surface p-1 shadow-card', className)}
    >
      {img}
    </span>
  );
}
