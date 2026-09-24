/**
 * 자치회 글 입력 규칙 (CNC-01, 02) — 순수 함수
 */
import type { CouncilPostInput } from '../types/api.js';

export const COUNCIL_LIMITS = {
  titleMin: 2,
  titleMax: 100,
  bodyMin: 10,
  bodyMax: 2000,
  imagesMax: 5,
  optionsMin: 2,
  optionsMax: 5,
  optionMax: 40,
  periodMaxDays: 60,
} as const;

export const COUNCIL_TYPE_LABEL: Record<CouncilPostInput['type'], string> = {
  notice: '공지',
  promo: '홍보',
  poll: '투표',
  report: '활동 보고',
};

const charLen = (s: string) => Array.from(s.trim()).length;

/** 입력 검증 — 순수 함수(테스트용). 문제 없으면 null */
export function validateCouncilInput(input: CouncilPostInput): string | null {
  if (!(input.type in COUNCIL_TYPE_LABEL)) return '글 종류를 골라 주세요.';
  const t = charLen(input.title);
  if (t < COUNCIL_LIMITS.titleMin || t > COUNCIL_LIMITS.titleMax)
    return `제목은 ${COUNCIL_LIMITS.titleMin}~${COUNCIL_LIMITS.titleMax}자로 써 주세요.`;
  const b = charLen(input.body);
  if (b < COUNCIL_LIMITS.bodyMin || b > COUNCIL_LIMITS.bodyMax)
    return `내용은 ${COUNCIL_LIMITS.bodyMin}~${COUNCIL_LIMITS.bodyMax}자로 써 주세요.`;
  const s = new Date(input.startsAt);
  const e = new Date(input.endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '게시 기간을 정해 주세요.';
  if (e <= s) return '게시 끝나는 날은 시작하는 날보다 뒤여야 해요.';
  if (e.getTime() - s.getTime() > COUNCIL_LIMITS.periodMaxDays * 86_400_000)
    return `게시 기간은 최대 ${COUNCIL_LIMITS.periodMaxDays}일까지예요.`;
  if (input.type === 'poll') {
    const opts = input.pollOptions.map((o) => o.trim()).filter(Boolean);
    if (opts.length < COUNCIL_LIMITS.optionsMin || opts.length > COUNCIL_LIMITS.optionsMax)
      return `투표 선택지는 ${COUNCIL_LIMITS.optionsMin}~${COUNCIL_LIMITS.optionsMax}개예요.`;
    if (opts.some((o) => charLen(o) > COUNCIL_LIMITS.optionMax))
      return `선택지는 ${COUNCIL_LIMITS.optionMax}자까지만요.`;
    if (new Set(opts).size !== opts.length) return '같은 선택지가 두 번 있어요.';
  }
  return null;
}
