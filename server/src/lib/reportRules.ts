/**
 * 리포트 규칙 (RPT-01, 02, 03, 08, 09) — 순수 함수·상수
 */
import { kst, previousWeekKey, weekKey, type DateInput } from './time.js';

export const TOP_CATEGORIES = [
  '동영상',
  '게임',
  'SNS',
  '메신저',
  '웹툰·만화',
  '음악',
  '학습',
  '기타',
] as const;
export type TopCategory = (typeof TOP_CATEGORIES)[number];

export const REPORT_LIMITS = {
  bodyMin: 100,
  bodyMax: 1000,
  goalMin: 1,
  goalMax: 100,
  goalReasonMax: 200,
  topAppMax: 50,
  avgMax: 1440,
} as const;

/** 반려 사유 프리셋 (TCH-02). other 는 교사가 직접 입력 */
export const REJECT_REASONS = {
  capture_mismatch: '캡처가 다른 화면이에요. 안내를 보고 다시 올려 주세요.',
  too_short: '성찰 글이 너무 짧아요. 100자 이상 써 주세요.',
  inappropriate: '올릴 수 없는 내용이 있어요. 고쳐서 다시 올려 주세요.',
  not_polite: '반말로 쓴 부분이 있어요. 이 사이트의 글은 모두 존댓말이에요. 고쳐서 다시 올려 주세요.',
  other: '',
} as const;
export type RejectReasonCode = keyof typeof REJECT_REASONS;

/**
 * 대상 주차: 이번 주 또는 지난주만 (7.1 운영 흐름 "토~월 작성").
 * 월·화요일에는 지난주가 기본값.
 */
export function allowedWeekKeys(now?: DateInput): { current: string; previous: string } {
  const current = weekKey(now);
  return { current, previous: previousWeekKey(current) };
}

export function defaultWeekKey(now?: DateInput): string {
  const { current, previous } = allowedWeekKeys(now);
  const dow = kst(now).isoWeekday(); // 1=월 … 7=일
  return dow <= 2 ? previous : current;
}

export function isAllowedWeekKey(key: string, now?: DateInput): boolean {
  const { current, previous } = allowedWeekKeys(now);
  return key === current || key === previous;
}

/** 지난주 대비 변화(분). 둘 중 하나라도 없으면 null */
export function diffMinutes(avg: number | null, prev: number | null): number | null {
  if (avg === null || prev === null) return null;
  return avg - prev;
}

/** 지난주 대비 변화율(%, 정수). 지난주가 0이면 null */
export function diffPercent(avg: number | null, prev: number | null): number | null {
  if (avg === null || prev === null || prev === 0) return null;
  return Math.round(((avg - prev) / prev) * 100);
}
