import { describe, expect, it } from 'vitest';
import { checkCelebrations, checkStamp, seoulToday, type StorageLike } from './celebrate';

// 디자인 개편 01-spec 6.5: 축하 판단은 localStorage 로만 (서버 변경 없음)
function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const base = { userId: 7, weekKey: '2026-W42', weekPoints: 10, tier: 'seed' as const };

describe('checkCelebrations (6.5)', () => {
  it('처음 방문이면 축하 없이 값만 저장한다', () => {
    const s = memory();
    expect(checkCelebrations(s, base)).toEqual({ tierUp: null, pointsGain: null });
    expect(s.data.get('ras.v1.7.lastWeekKey')).toBe('2026-W42');
    expect(s.data.get('ras.v1.7.lastWeekPoints')).toBe('10');
    expect(s.data.get('ras.v1.7.lastTier')).toBe('seed');
  });

  it('같은 주에 포인트가 늘면 늘어난 만큼 축하한다', () => {
    const s = memory();
    checkCelebrations(s, base);
    expect(checkCelebrations(s, { ...base, weekPoints: 15 }).pointsGain).toBe(5);
    // 한 번 축하하면 같은 값으로 다시 열어도 축하하지 않는다
    expect(checkCelebrations(s, { ...base, weekPoints: 15 }).pointsGain).toBeNull();
  });

  it('주가 바뀌면 축하 없이 새 주 값을 저장한다', () => {
    const s = memory();
    checkCelebrations(s, base);
    const r = checkCelebrations(s, { ...base, weekKey: '2026-W43', weekPoints: 30 });
    expect(r.pointsGain).toBeNull();
    expect(s.data.get('ras.v1.7.lastWeekKey')).toBe('2026-W43');
  });

  it('포인트가 줄면(회수) 축하하지 않는다', () => {
    const s = memory();
    checkCelebrations(s, { ...base, weekPoints: 20 });
    expect(checkCelebrations(s, { ...base, weekPoints: 12 }).pointsGain).toBeNull();
  });

  it('등급이 올라가면 등급 축하, 내려가면 축하 없음', () => {
    const s = memory();
    checkCelebrations(s, base);
    expect(checkCelebrations(s, { ...base, tier: 'sprout' }).tierUp).toBe('sprout');
    expect(checkCelebrations(s, { ...base, tier: 'seed' }).tierUp).toBeNull();
  });

  it('학생 ID 별로 따로 저장한다(교실 공용 PC)', () => {
    const s = memory();
    checkCelebrations(s, base);
    expect(checkCelebrations(s, { ...base, userId: 8, weekPoints: 50 }).pointsGain).toBeNull();
  });

  it('저장소를 못 쓰면(null·예외) 축하 없이 넘어간다', () => {
    expect(checkCelebrations(null, base)).toEqual({ tierUp: null, pointsGain: null });
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(checkCelebrations(broken, base)).toEqual({ tierUp: null, pointsGain: null });
  });
});

describe('checkStamp (6.5)', () => {
  it('오늘 첫 방문은 도장 움직임, 같은 날 두 번째 방문은 움직임 없음', () => {
    const s = memory();
    expect(checkStamp(s, 7, '2026-10-13')).toBe(true);
    expect(checkStamp(s, 7, '2026-10-13')).toBe(false);
    expect(checkStamp(s, 7, '2026-10-14')).toBe(true);
  });

  it('seoulToday 는 Asia/Seoul 날짜를 쓴다', () => {
    // UTC 2026-10-13 16:00 = 서울 10-14 01:00
    expect(seoulToday(new Date('2026-10-13T16:00:00Z'))).toBe('2026-10-14');
  });
});
