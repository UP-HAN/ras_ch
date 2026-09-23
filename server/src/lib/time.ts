/**
 * 시간·주차 유틸 (절대 규칙 7): Asia/Seoul 고정, ISO 8601 주차(월요일 시작), dayjs만 사용.
 *  - weekKey  : "2026-W38"
 *  - dayKey   : "2026-09-23"
 *  - monthKey : "2026-09"
 */
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export const TZ = 'Asia/Seoul';

export type DateInput = Date | string | number | Dayjs;

/** 어떤 입력이든 Asia/Seoul 기준 Dayjs로 */
export function kst(input?: DateInput): Dayjs {
  return input === undefined ? dayjs().tz(TZ) : dayjs(input).tz(TZ);
}

export function now(): Date {
  return new Date();
}

export function weekKey(input?: DateInput): string {
  const d = kst(input);
  const year = d.isoWeekYear();
  const week = String(d.isoWeek()).padStart(2, '0');
  return `${year}-W${week}`;
}

export function dayKey(input?: DateInput): string {
  return kst(input).format('YYYY-MM-DD');
}

export function monthKey(input?: DateInput): string {
  return kst(input).format('YYYY-MM');
}

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

export function isWeekKey(value: string): boolean {
  return WEEK_KEY_RE.test(value);
}

/** 주차 키의 월요일 00:00 ~ 다음 월요일 00:00 (KST). end는 배타적. */
export function weekRange(key: string): { start: Dayjs; end: Dayjs } {
  const m = WEEK_KEY_RE.exec(key);
  if (!m) throw new Error(`주차 키 형식이 아닙니다: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO 규칙: 1월 4일이 포함된 주가 그 해의 1주차
  const jan4 = dayjs.tz(`${year}-01-04`, TZ);
  const week1Monday = jan4.startOf('isoWeek');
  const start = week1Monday.add(week - 1, 'week');
  return { start, end: start.add(1, 'week') };
}

/** 지난주 주차 키 */
export function previousWeekKey(key: string): string {
  return weekKey(weekRange(key).start.subtract(1, 'day'));
}

export function monthRange(key: string): { start: Dayjs; end: Dayjs } {
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error(`월 키 형식이 아닙니다: ${key}`);
  const start = dayjs.tz(`${key}-01`, TZ);
  return { start, end: start.add(1, 'month') };
}

export function previousMonthKey(key: string): string {
  return monthRange(key).start.subtract(1, 'day').format('YYYY-MM');
}

/** MySQL DATETIME(3) 문자열(KST 벽시계) */
export function toDbDateTime(input?: DateInput): string {
  return kst(input).format('YYYY-MM-DD HH:mm:ss.SSS');
}
