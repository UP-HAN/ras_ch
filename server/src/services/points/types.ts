/**
 * 포인트 엔진 계약 (PT-01, PT-02, PT-03, 7.5, 절대 규칙 1)
 *
 * 모든 지급·회수는 이 인터페이스를 통해서만 원장(point_ledger)에 기록된다.
 * S2·S3 의 승인·좋아요·댓글 흐름은 이 시그니처만 호출하고, 구현체는 S4(4-1)에서 채운다.
 */
import type { PoolConnection } from 'mysql2/promise';
import type { CapCheckReason } from '../../lib/pointCaps.js';

/** 도메인 이벤트 → 규칙 코드. 7.1 규칙표의 code 와 같다 */
export type RuleCode =
  | 'REPORT_APPROVED'
  | 'REPORT_DECREASE'
  | 'GOAL_CHECKED'
  | 'ARTICLE_APPROVED'
  | 'REPORTER_BONUS'
  | 'COMMENT_WRITTEN'
  | 'LIKE_GIVEN'
  | 'LIKE_RECEIVED_POST'
  | 'LIKE_RECEIVED_COMMENT'
  | 'DAILY_LOGIN'
  | 'STREAK_7'
  | 'POST_READ'
  | 'REVIEW_DONE'
  | 'SURVEY_ANSWERED'
  | 'AGENDA_OPINION'
  | 'PROPOSAL_ADOPTED'
  | 'TEACHER_BONUS'
  | 'WEEKLY_GIFT'
  | 'MONTHLY_TOP'
  | 'GROWTH_AWARD'
  | 'MONTHLY_AWARD'
  | 'NEWS_VOTE'
  | 'NEWS_OPINION'
  | 'BEST_OPINION';

export interface PointEvent {
  ruleCode: RuleCode;
  /** 포인트를 받는 학생 */
  userId: number;
  /** 근거 객체 (post / comment / like / survey / settlement …) */
  refType?: string;
  refId?: number;
  /** 발생 시각(주차·일자 키의 기준). 생략 시 현재 */
  occurredAt?: Date;
  /** 교사 수동 지급 시 지급자 */
  grantedBy?: number;
  /** 범위형 규칙(5~20P)의 요청 금액 */
  amount?: number;
  note?: string;
  /**
   * per_object 상한의 대상 객체. 생략하면 ref 와 같다.
   * 예: LIKE_RECEIVED_POST 는 ref=like(회수 키)이지만 상한 객체는 post(게시글당 20P)
   */
  capObject?: { type: string; id: number };
  /**
   * 멱등 키. 같은 키로 두 번 오면 두 번째는 DUPLICATE 로 무시된다.
   * 규칙: `${ruleCode}:${refType}:${refId}` (예: "REPORT_APPROVED:post:123")
   */
  eventKey?: string;
}

export type GrantSkipReason = CapCheckReason | 'DUPLICATE' | 'NO_RULE' | 'NOT_ELIGIBLE';

export interface LedgerResult {
  granted: boolean;
  ledgerId: number | null;
  amount: number;
  reason?: GrantSkipReason;
}

export interface ReverseOptions {
  /** 회수 사유 (반려·삭제·숨김·좋아요 취소) */
  note: string;
  /** 특정 규칙만 회수(예: 좋아요 취소 시 LIKE_GIVEN + LIKE_RECEIVED_POST) */
  ruleCodes?: RuleCode[];
  /** 회수 실행자(교사) */
  actorId?: number;
}

export interface ReverseResult {
  reversedLedgerIds: number[];
  totalAmount: number;
}

export interface PointService {
  /** 규칙 조회 → 상한 검사(원장 집계) → 원장 insert. 트랜잭션 안이면 conn 을 넘긴다 */
  apply(event: PointEvent, conn?: PoolConnection): Promise<LedgerResult>;
  /** 근거 객체로 발생한 지급 행을 reversal_of 로 가리키는 음수 행으로 회수 (PT-03) */
  reverse(
    refType: string,
    refId: number,
    opts: ReverseOptions,
    conn?: PoolConnection,
  ): Promise<ReverseResult>;
}

export function buildEventKey(ruleCode: RuleCode, refType: string, refId: number): string {
  return `${ruleCode}:${refType}:${refId}`;
}
