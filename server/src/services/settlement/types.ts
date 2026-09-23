/**
 * 월간 결산 산식의 입력·출력 타입 (HOF-02, 02a, 02b, 02c, 03, 04, 7.2~7.4)
 *
 * 원칙: 산식 함수는 DB를 모른다. `loadInputs.ts`(S5)가 아래 입력을 만들고,
 * 각 산식 함수는 배열을 받아 배열을 돌려준다. 결과는 monthly_* 스냅샷 테이블에 저장된다.
 */

export interface StudentMonthInput {
  userId: number;
  grade: number;
  classId: number;
  /** 이번 달 원장 합계 */
  points: number;
  /** 지난달 원장 합계(성장률용). 첫 달은 null */
  prevPoints: number | null;
  /** 동점 처리(HOF-03): 리포트 게시 > 기사 게시 > 활동 일수 */
  reportCount: number;
  articleCount: number;
  activeDays: number;
  parentConsent: 'Y' | 'N';
  /** 이번 달 주간 선물 수령 여부(HOF-01b "주간 수령자 제외" 토글) */
  receivedWeeklyGift: boolean;
}

export interface ClassMonthInput {
  classId: number;
  grade: number;
  /** 재적 인원(미동의 학생 제외) */
  memberCount: number;
  avgPoints: number;
  /** 리포트 게시 학생 비율 0~1 */
  participationRate: number;
}

/** 지난달 선정 결과 — 연속 선정 제한(HOF-02c) 판단용 */
export interface PriorWinners {
  giftUserIds: Set<number>;
  growthUserIds: Set<number>;
  winnerClassId: number | null;
}

export interface SettlementSettings {
  perGradeGiftCount: number;
  perGradeGrowthCount: number;
  /** 성장률 자격: 지난달 최소 포인트(기본 30) */
  growthMinPrevPoints: number;
  excludeWeeklyGift: boolean;
  /** 첫 달(지난달 결산 없음)이면 성장률 부문 미운영 */
  isFirstMonth: boolean;
}

export interface RankedStudent {
  userId: number;
  grade: number;
  classId: number;
  points: number;
  rankInGrade: number;
  selected: boolean;
  /** 연속 선정 제한 등으로 다음 순위로 넘긴 사유 */
  skippedReason: string | null;
  tiebreak: { reportCount: number; articleCount: number; activeDays: number };
}

export interface GrowthResult extends RankedStudent {
  prevPoints: number;
  growthRate: number;
}

export interface ClassRewardResult {
  classId: number;
  grade: number;
  memberCount: number;
  avgPoints: number;
  participationRate: number;
  rankOverall: number;
  isWinner: boolean;
  skippedReason: string | null;
}

export type AwardCategory = 'phonefree' | 'reporter' | 'participation';

export interface AwardCandidate {
  category: AwardCategory;
  userId: number;
  grade: number;
  score: number;
  /** 산식 근거(항목별 점수) — 결산 화면에 표시 */
  breakdown: Record<string, number>;
  rankInGrade: number;
  /** 다른 부문과 중복 등 경고(HOF-08) */
  warnings: string[];
}
