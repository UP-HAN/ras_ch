import type { Tier } from '@server-types/db';
import { TIER_ORDER } from './gamify';

/**
 * 축하·출석 도장 판단 (디자인 개편 01-spec 6.5). 서버 변경 없이 브라우저 localStorage 로만 판단한다.
 *  - 키는 학생 ID 별로 나눈다(교실 PC 공용 대비): ras.v1.{userId}.lastWeekKey / lastWeekPoints / lastTier / stampDate
 *  - 저장소를 못 쓰면(사생활 보호 모드 등) 축하·도장 움직임 없이 조용히 넘어간다
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** window.localStorage 를 안전하게 얻는다. 막혀 있으면 null */
export function safeStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(s: StorageLike | null, key: string): string | null {
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

function write(s: StorageLike | null, key: string, value: string): void {
  if (!s) return;
  try {
    s.setItem(key, value);
  } catch {
    // 저장 공간이 꽉 찼거나 막힘: 축하가 다시 나올 수 있을 뿐 기능에는 영향 없음
  }
}

const storageKey = (userId: number, name: string) => `ras.v1.${userId}.${name}`;

export interface CelebrateInput {
  userId: number;
  /** ISO 주차 키 (예: 2026-W42) */
  weekKey: string;
  weekPoints: number;
  tier: Tier;
}

export interface CelebrateResult {
  /** 등급이 올라갔으면 새 등급 */
  tierUp: Tier | null;
  /** 같은 주에 늘어난 포인트(양수) */
  pointsGain: number | null;
}

/** 지난번 값과 비교해 축하할 것을 고르고, 지금 값을 저장한다. 처음 보는 기기면 저장만 한다 */
export function checkCelebrations(s: StorageLike | null, input: CelebrateInput): CelebrateResult {
  const { userId, weekKey, weekPoints, tier } = input;
  const result: CelebrateResult = { tierUp: null, pointsGain: null };

  const lastWeek = read(s, storageKey(userId, 'lastWeekKey'));
  const lastPointsRaw = read(s, storageKey(userId, 'lastWeekPoints'));
  const lastPoints = lastPointsRaw === null ? NaN : Number(lastPointsRaw);
  if (lastWeek === weekKey && Number.isFinite(lastPoints) && weekPoints > lastPoints) {
    result.pointsGain = weekPoints - lastPoints;
  }
  write(s, storageKey(userId, 'lastWeekKey'), weekKey);
  write(s, storageKey(userId, 'lastWeekPoints'), String(weekPoints));

  const lastTier = read(s, storageKey(userId, 'lastTier'));
  const before = lastTier === null ? -1 : TIER_ORDER.indexOf(lastTier as Tier);
  const now = TIER_ORDER.indexOf(tier);
  if (before >= 0 && now > before) result.tierUp = tier;
  write(s, storageKey(userId, 'lastTier'), tier);

  return result;
}

/** 오늘 날짜 (Asia/Seoul, YYYY-MM-DD) */
export function seoulToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 오늘 처음 홈을 열었으면 true(도장 "쾅" 1번) 후 저장. 같은 날 두 번째부터는 false(정지 도장) */
export function checkStamp(s: StorageLike | null, userId: number, today: string): boolean {
  if (!s) return false;
  const last = read(s, storageKey(userId, 'stampDate'));
  if (last === today) return false;
  write(s, storageKey(userId, 'stampDate'), today);
  return true;
}
