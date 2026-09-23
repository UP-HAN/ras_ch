/**
 * 읽기 이벤트 판정 (PT-10) — 순수 함수
 *  - 서버가 기록한 열람 시작 시각으로부터 10초 이상 + 끝까지 스크롤했다고 보고했을 때만 완료
 */
export const READ_MIN_SECONDS = 10;

export type ReadRejectReason = 'TOO_FAST' | 'NOT_SCROLLED' | 'ALREADY_DONE';

export function isReadComplete(
  openedAt: Date,
  now: Date,
  scrolledToEnd: boolean,
  alreadyCompleted: boolean,
): { ok: true } | { ok: false; reason: ReadRejectReason } {
  if (alreadyCompleted) return { ok: false, reason: 'ALREADY_DONE' };
  if (!scrolledToEnd) return { ok: false, reason: 'NOT_SCROLLED' };
  if ((now.getTime() - openedAt.getTime()) / 1000 < READ_MIN_SECONDS)
    return { ok: false, reason: 'TOO_FAST' };
  return { ok: true };
}
