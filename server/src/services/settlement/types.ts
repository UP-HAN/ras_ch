/**
 * 월간 결산 산식의 입력·출력 타입 (HOF-02, 02a, 02b, 02c, 03, 04, 7.2~7.4)
 *
 * 원칙: 산식 함수는 DB를 모른다. `loadInputs.ts`가 아래 입력을 만들고,
 * 각 산식 함수는 배열을 받아 배열을 돌려준다. 결과는 monthly_* 스냅샷 테이블에 저장된다.
 */

export interface StudentMonthInput {
  userId: number;
  grade: number;
  classId: number;
  /** 이번 달 원장 합계 (month_key 기준 — 리포트 승인 포인트는 그 주차 월요일이 속한 달) */
  points: number;
  /** 지난달 원장 합계(성장률용). 첫 달은 null */
  prevPoints: number | null;
  /** 동점 처리(HOF-03): 리포트 게시 > 기사 게시 > 활동 일수 */
  reportCount: number;
  articleCount: number;
  activeDays: number;
  parentConsent: 'Y' | 'N';
  /** 이번 달 주간 선물 수령 여부(HOF-01b "주간 수령자 제외" 토글, 2차) */
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

/** 승인 교사가 확정 시 허용한 예외(연속 선정 제한 무시) */
export interface ConsecutiveOverrides {
  userIds: Set<number>;
  allowClass: boolean;
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
export const AWARD_CATEGORIES: AwardCategory[] = ['phonefree', 'reporter', 'participation'];

/** 3부문 산식 입력(7.2~7.4). 그 달(approved_at 기준)의 활동 집계 */
export interface AwardStudentInput {
  userId: number;
  grade: number;
  /** 승인 리포트(일기 포함) 수 */
  reportCount: number;
  articleCount: number;
  /** 월초 첫 리포트·월말 마지막 리포트의 하루 평균 사용시간(분). 없으면 null */
  firstReportMinutes: number | null;
  lastReportMinutes: number | null;
  /** 교사 평가 평균 1~3. 없으면 null → 20점 */
  teacherScore: number | null;
  /** 내 리포트가 받은 좋아요 + 댓글 수 */
  reportReactions: number;
  /** 내 기사가 받은 엄지척 합 / 댓글 수 합 */
  articleLikes: number;
  articleComments: number;
  /** 추천 기사(is_featured) 수 */
  featuredCount: number;
  /** 내가 쓴 댓글 수 */
  commentsWritten: number;
  /** 내가 누른 좋아요 수 */
  likesGiven: number;
  /** 내 댓글이 받은 좋아요 수 */
  commentLikesReceived: number;
  /** 출석 일수 */
  attendanceDays: number;
  /** 끝까지 읽은 글 수 */
  readCount: number;
  /** 토론 투표에 참여한 주제 수 (NWS) */
  newsVoteTopics: number;
  /** 베스트 의견 선정 수 (NWS-09) */
  bestOpinions: number;
}

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
