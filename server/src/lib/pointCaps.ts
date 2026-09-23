/**
 * 포인트 상한 검사 — 순수 함수 (PT-02, 7.5, 절대 규칙 1)
 *
 * 상한은 별도 카운터 없이 원장(point_ledger)을 집계해 판단한다. 이 모듈은 DB를 모른다:
 * 호출자(PointService)가 각 cap 에 대해 원장 집계값(usage)을 구해 넘기면 허용 여부만 돌려준다.
 *
 * caps JSON 예시 (point_rules.caps):
 *   [{ "scope": "day", "unit": "count", "max": 5 }]                       // 일 5회
 *   [{ "scope": "per_object", "unit": "points", "max": 20 }]              // 게시글당 20P
 *   [{ "scope": "week", "unit": "points", "max": 50 },
 *    { "scope": "week", "unit": "points", "max": 300, "by": "granter" }]  // 학생당 주 50 + 교사당 주 300
 *   [{ "scope": "day", "unit": "count", "max": 5, "share_codes": ["NEWS_OPINION","AGENDA_OPINION"] }]
 */
import type { PointCap, PointRuleRow } from '../types/db.js';

/** 원장 집계값: 해당 cap 범위(일/주/월/객체) 안에서 이미 지급된 건수·포인트(회수분 반영 후) */
export interface CapUsage {
  count: number;
  points: number;
}

export type CapCheckReason = 'RULE_INACTIVE' | 'CAP_REACHED' | 'AMOUNT_OUT_OF_RANGE';

export interface CapCheckResult {
  allowed: boolean;
  /** 허용 시 실제 지급할 포인트(상한 잔여만큼 깎일 수 있음: points 단위 cap) */
  amount: number;
  reason?: CapCheckReason;
  capIndex?: number;
}

export type RuleForCaps = Pick<
  PointRuleRow,
  'code' | 'amount' | 'amount_min' | 'amount_max' | 'caps' | 'is_active'
>;

/** cap 하나를 원장 집계 키로 표현(집계 SQL 작성·캐시 키용) */
export function capKey(ruleCode: string, cap: PointCap): string {
  const codes = [ruleCode, ...(cap.share_codes ?? [])].sort().join('+');
  return `${codes}|${cap.scope}|${cap.unit}|${cap.by ?? 'user'}`;
}

/** 규칙의 지급 금액을 정한다. 범위형(5~20)은 요청 금액을 검증한다 */
export function resolveAmount(rule: RuleForCaps, requested?: number): number | null {
  if (rule.amount_min !== null && rule.amount_max !== null) {
    const amt = requested ?? rule.amount;
    if (!Number.isInteger(amt) || amt < rule.amount_min || amt > rule.amount_max) return null;
    return amt;
  }
  return rule.amount;
}

/**
 * @param usages caps 와 같은 순서의 집계값
 * @param requested 범위형 규칙의 요청 금액(교사 칭찬 등)
 */
export function checkCaps(
  rule: RuleForCaps,
  usages: readonly CapUsage[],
  requested?: number,
): CapCheckResult {
  if (rule.is_active !== 1) return { allowed: false, amount: 0, reason: 'RULE_INACTIVE' };
  const amount = resolveAmount(rule, requested);
  if (amount === null) return { allowed: false, amount: 0, reason: 'AMOUNT_OUT_OF_RANGE' };

  let grant = amount;
  for (let i = 0; i < rule.caps.length; i += 1) {
    const cap = rule.caps[i] as PointCap;
    const usage = usages[i] ?? { count: 0, points: 0 };
    if (cap.unit === 'count') {
      if (usage.count >= cap.max)
        return { allowed: false, amount: 0, reason: 'CAP_REACHED', capIndex: i };
    } else {
      const remaining = cap.max - usage.points;
      if (remaining <= 0) return { allowed: false, amount: 0, reason: 'CAP_REACHED', capIndex: i };
      grant = Math.min(grant, remaining);
    }
  }
  return { allowed: true, amount: grant };
}
