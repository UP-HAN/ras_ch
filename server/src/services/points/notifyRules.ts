/**
 * 포인트 획득 알림 대상 (CMN-03). 1~2P 짜리 잦은 이벤트(좋아요·읽기·출석·검토)는 알림을 만들지 않는다.
 */
import type { RuleCode } from './types.js';

export const NOTIFY_RULES: ReadonlySet<RuleCode> = new Set<RuleCode>([
  'REPORT_APPROVED',
  'REPORT_DECREASE',
  'GOAL_CHECKED',
  'ARTICLE_APPROVED',
  'REPORTER_BONUS',
  'TEACHER_BONUS',
  'STREAK_7',
  'WEEKLY_GIFT',
  'MONTHLY_TOP',
  'GROWTH_AWARD',
  'MONTHLY_AWARD',
  'PROPOSAL_ADOPTED',
  'BEST_OPINION',
]);

export function pointsMessage(amount: number, ruleName: string, note: string | null): string {
  const base = `+${amount}P ${ruleName}`;
  return note ? `${base} — ${note}` : base;
}
