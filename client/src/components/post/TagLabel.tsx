import { RasIcon } from '@/components/fun/Mascot';
import { isRasKind } from '@/lib/illustrations';
import { ARTICLE_TAGS } from './articleMeta';

/**
 * 기사 영역 표시: 독서·예술문화·스포츠(R·A·S)는 RAS 아이콘 그림, 폰프리는 이모지 (2026-10-13 RAS 그림 요청).
 * 아이콘과 글자가 서로 다른 줄로 떨어지지 않게 한 덩어리(nowrap)로 둔다.
 */
export function TagLabel({ tagKey, size = 22 }: { tagKey: string; size?: number }) {
  const t = ARTICLE_TAGS.find((x) => x.key === tagKey);
  if (!t) return <>{tagKey}</>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {isRasKind(t.key) ? (
        <RasIcon kind={t.key} size={size} />
      ) : (
        <span aria-hidden="true">{t.emoji}</span>
      )}
      {t.label}
    </span>
  );
}
