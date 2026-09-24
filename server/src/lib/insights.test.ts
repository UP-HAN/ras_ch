process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import {
  bucketMinutes,
  median,
  pairedChange,
  sample,
  shares,
  splitPeriods,
  weeksBetween,
} from './insights.js';

describe('실천 변화 리포트 — 표본·대표성', () => {
  it('sample: 0명 none, 5명 미만 tiny, 50% 미만 partial, 그 외 ok', () => {
    expect(sample(0, 58, 'all').label).toBe('none');
    expect(sample(4, 58, 'submitted')).toMatchObject({ pct: 7, label: 'tiny' });
    expect(sample(20, 58, 'submitted')).toMatchObject({ pct: 34, label: 'partial' });
    expect(sample(40, 58, 'paired')).toMatchObject({ pct: 69, label: 'ok', basis: 'paired' });
    expect(sample(3, 0, 'all').pct).toBe(0);
  });
  it('median 홀·짝', () => {
    expect(median([])).toBeNull();
    expect(median([90, 30, 60])).toBe(60);
    expect(median([30, 60, 90, 120])).toBe(75);
  });
  it('weeksBetween 포함 범위', () => {
    expect(weeksBetween('2026-W36', '2026-W39')).toEqual([
      '2026-W36',
      '2026-W37',
      '2026-W38',
      '2026-W39',
    ]);
    expect(weeksBetween('2026-W39', '2026-W39')).toEqual(['2026-W39']);
    expect(weeksBetween('2025-W52', '2026-W02')).toEqual(['2025-W52', '2026-W01', '2026-W02']); // 2026 은 53주 해
  });
  it('pairedChange: 평균·변화·감소 비율', () => {
    const r = pairedChange([
      { first: 120, recent: 90 },
      { first: 100, recent: 110 },
      { first: 80, recent: 80 },
      { first: 200, recent: 120 },
    ]);
    expect(r).toMatchObject({
      firstAvg: 125,
      recentAvg: 100,
      deltaMinutes: -25,
      deltaPct: -20,
      decreasedPct: 50,
      increasedPct: 25,
      samePct: 25,
      n: 4,
    });
    expect(pairedChange([]).n).toBe(0);
  });
  it('bucketMinutes 4구간', () => {
    const b = bucketMinutes([30, 59, 60, 119, 120, 180, 300]);
    expect(b.map((x) => x.count)).toEqual([2, 2, 1, 2]);
    expect(b[0]?.pct).toBe(29);
  });
  it('shares 상위 N·비율', () => {
    expect(shares(['게임', '동영상', '게임', '게임', null, '', 'SNS', 'SNS'], 2)).toEqual([
      { key: '게임', count: 3, pct: 50 },
      { key: 'SNS', count: 2, pct: 33 },
    ]);
  });
  it('splitPeriods: 4주 이상은 2주씩, 2~3주는 1주씩, 1주는 최근 없음', () => {
    expect(splitPeriods(['a', 'b', 'c', 'd', 'e'])).toEqual({
      first: ['a', 'b'],
      recent: ['d', 'e'],
    });
    expect(splitPeriods(['a', 'b', 'c'])).toEqual({ first: ['a'], recent: ['c'] });
    expect(splitPeriods(['a'])).toEqual({ first: ['a'], recent: [] });
  });
});
