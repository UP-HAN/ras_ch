/**
 * 날짜·시각 공통 포맷터 (QA #22): 초 단위 없이 "9. 23. 오후 4:46" 형태. 브라우저 로캘 시간대(KST) 기준.
 */
const DT: Intl.DateTimeFormatOptions = {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};
const DT_FULL: Intl.DateTimeFormatOptions = { ...DT, year: 'numeric' };

export function fmtDateTime(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', withYear ? DT_FULL : DT);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** 바이트 → "1.2GB" / "345MB" / "12KB" (백업 크기 표시용) */
export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '';
  const KB = 1024;
  if (n < KB) return `${n}B`;
  if (n < KB * KB) return `${Math.round(n / KB)}KB`;
  if (n < KB * KB * KB) return `${Math.round(n / KB / KB)}MB`;
  return `${(n / KB / KB / KB).toFixed(1)}GB`;
}

/** "2026-W39" → "39주차" */
export const weekShort = (wk: string) => `${Number(wk.slice(6))}주차`;
