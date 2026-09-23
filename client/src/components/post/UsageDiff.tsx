import { Badge } from '@/components/ui';

// eslint-disable-next-line react-refresh/only-export-components -- 표시 유틸을 같은 파일에 둔다
export function minutesLabel(min: number | null): string {
  if (min === null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 지난주 대비 변화 (RPT-08): ▼25분(−12%) 형태 */
export function UsageDiff({
  avg,
  prev,
  diff,
}: {
  avg: number | null;
  prev: number | null;
  diff: number | null;
}) {
  if (avg === null) return <Badge tone="neutral">사용시간 미입력</Badge>;
  if (prev === null || diff === null) return <Badge tone="info">첫 리포트예요</Badge>;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  if (diff < 0) {
    return (
      <Badge tone="success">
        ▼ {minutesLabel(-diff)} 줄었어요{pct !== null ? ` (${pct}%)` : ''}
      </Badge>
    );
  }
  if (diff > 0) {
    return (
      <Badge tone="warn">
        ▲ {minutesLabel(diff)} 늘었어요{pct !== null ? ` (+${pct}%)` : ''}
      </Badge>
    );
  }
  return <Badge tone="neutral">지난주와 같아요</Badge>;
}
