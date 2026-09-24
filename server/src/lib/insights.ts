/**
 * 실천 변화 리포트 — 순수 함수 (관리자 지표 페이지). 모든 수치는 "누구 기준인가"(표본)를 함께 가진다.
 *  - all       : 분모가 전체 재학생 (참여율·제출률)
 *  - submitted : 그 주 리포트를 낸 학생만 (평균 사용시간 등)
 *  - paired    : 시작 구간·최근 구간 둘 다 낸 같은 학생만 (개선 판단)
 */
import { previousWeekKey, weekKey, weekRange } from './time.js';

export type SampleBasis = 'all' | 'submitted' | 'paired';
export type SampleLabel = 'ok' | 'partial' | 'tiny' | 'none';

export interface Sample {
  n: number;
  of: number;
  pct: number;
  basis: SampleBasis;
  /** none: 0명, tiny: 5명 미만(참고만), partial: 전체의 50% 미만(일부 학생 결과), ok */
  label: SampleLabel;
}

export const TINY_SAMPLE = 5;
export const PARTIAL_COVERAGE_PCT = 50;

export function sample(n: number, of: number, basis: SampleBasis): Sample {
  const pct = of > 0 ? Math.round((n / of) * 100) : 0;
  const label: SampleLabel =
    n === 0 ? 'none' : n < TINY_SAMPLE ? 'tiny' : pct < PARTIAL_COVERAGE_PCT ? 'partial' : 'ok';
  return { n, of, pct, basis, label };
}

export function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2
    ? (s[mid] as number)
    : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/** from ~ to 주차 키 목록(포함). to 가 from 보다 앞이면 [to] */
export function weeksBetween(from: string, to: string, max = 60): string[] {
  const out: string[] = [];
  let k = to;
  while (out.length < max) {
    out.unshift(k);
    if (k === from || k < from) break;
    k = previousWeekKey(k);
  }
  return out;
}

/** 다음 주차 키 */
export function nextWeekKey(k: string): string {
  return weekKey(weekRange(k).end);
}

export interface PairedInput {
  first: number;
  recent: number;
}

export interface PairedChange {
  firstAvg: number | null;
  recentAvg: number | null;
  deltaMinutes: number | null;
  deltaPct: number | null;
  decreasedPct: number | null;
  increasedPct: number | null;
  samePct: number | null;
  n: number;
}

/** 같은 학생의 시작 구간 평균 vs 최근 구간 평균 변화 */
export function pairedChange(pairs: PairedInput[]): PairedChange {
  const n = pairs.length;
  if (n === 0)
    return {
      firstAvg: null,
      recentAvg: null,
      deltaMinutes: null,
      deltaPct: null,
      decreasedPct: null,
      increasedPct: null,
      samePct: null,
      n: 0,
    };
  const firstAvg = mean(pairs.map((p) => p.first)) as number;
  const recentAvg = mean(pairs.map((p) => p.recent)) as number;
  const decreased = pairs.filter((p) => p.recent < p.first).length;
  const increased = pairs.filter((p) => p.recent > p.first).length;
  return {
    firstAvg,
    recentAvg,
    deltaMinutes: recentAvg - firstAvg,
    deltaPct: firstAvg > 0 ? Math.round(((recentAvg - firstAvg) / firstAvg) * 100) : null,
    decreasedPct: pct(decreased, n),
    increasedPct: pct(increased, n),
    samePct: pct(n - decreased - increased, n),
    n,
  };
}

export interface BucketShare {
  label: string;
  count: number;
  pct: number;
}

export const MINUTE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: '1시간 미만', max: 60 },
  { label: '1~2시간', max: 120 },
  { label: '2~3시간', max: 180 },
  { label: '3시간 이상', max: Number.POSITIVE_INFINITY },
];

/** 하루 평균 사용시간(분) 분포 */
export function bucketMinutes(values: number[]): BucketShare[] {
  const counts = MINUTE_BUCKETS.map(() => 0);
  for (const v of values) {
    const i = MINUTE_BUCKETS.findIndex((b) => v < b.max);
    const idx = i < 0 ? MINUTE_BUCKETS.length - 1 : i;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return MINUTE_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i] as number,
    pct: pct(counts[i] as number, values.length),
  }));
}

export interface Share {
  key: string;
  count: number;
  pct: number;
}

/** 문자열 빈도 상위 N (비율은 전체 항목 대비) */
export function shares(items: Array<string | null | undefined>, top = 5): Share[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    const k = (it ?? '').trim();
    if (!k) continue;
    total += 1;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, top)
    .map(([key, count]) => ({ key, count, pct: pct(count, total) }));
}

/** 시작 구간·최근 구간 주차 나누기 (각 최대 2주, 겹치지 않게) */
export function splitPeriods(weeks: string[]): { first: string[]; recent: string[] } {
  if (weeks.length <= 1) return { first: weeks, recent: [] };
  const size = weeks.length >= 4 ? 2 : 1;
  return { first: weeks.slice(0, size), recent: weeks.slice(-size) };
}
