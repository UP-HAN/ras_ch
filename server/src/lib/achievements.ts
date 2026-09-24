/**
 * 칭호·업적 정의와 판정 — 순수 함수 (게이미피케이션, PLAN 8장 "게임 요소는 가볍게")
 *  - 순위·비교 없이 "무엇을 해냈나"만 본다. 한 번 얻으면 회수하지 않는다.
 *  - 판정은 집계 객체(AchievementStats) → 달성 코드 목록. DB 집계는 AchievementService 가 만든다.
 */
export interface AchievementStats {
  approvedReports: number;
  /** 최근 승인 리포트 주차 키 목록(오름차순) — 연속 주 판정 */
  reportWeekKeys: string[];
  /** 승인 리포트의 diff_minutes 를 주차순으로 (null=첫 리포트/미입력) */
  reportDiffs: Array<number | null>;
  commentsWritten: number;
  likesReceived: number;
  debateTopics: number;
  bestOpinions: number;
  attendanceStreak: number;
  approvedArticles: number;
  hallOfFame: number;
  readCount: number;
  reviewsDone: number;
}

export interface AchievementDef {
  code: string;
  emoji: string;
  label: string;
  /** 조건 문구 (아이가 읽는다) */
  hint: string;
  /** 진행률 표시용: 현재값/목표값 (없으면 null) */
  progress: (s: AchievementStats) => { current: number; target: number } | null;
  earned: (s: AchievementStats) => boolean;
}

/** 연속 ISO 주차 최대 길이 (예: ['2026-W37','2026-W38','2026-W39'] → 3) */
export function longestWeekStreak(keys: string[]): number {
  if (keys.length === 0) return 0;
  const idx = (k: string) => {
    const m = /^(\d{4})-W(\d{2})$/.exec(k);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]); // 연도 경계(52/53주) 는 근사 — 12월 말 1주 정도 오차 허용
  };
  const sorted = [...new Set(keys)]
    .map(idx)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1] as number;
    const cur = sorted[i] as number;
    if (cur === prev + 1 || (cur % 60 === 1 && (cur - prev === 8 || cur - prev === 9))) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }
  return best;
}

/** 마지막부터 거슬러 연속으로 감소(diff<0)한 리포트 수 */
export function trailingDecreaseStreak(diffs: Array<number | null>): number {
  let n = 0;
  for (let i = diffs.length - 1; i >= 0; i -= 1) {
    const d = diffs[i];
    if (d !== null && d !== undefined && d < 0) n += 1;
    else break;
  }
  return n;
}

const countDef = (
  code: string,
  emoji: string,
  label: string,
  hint: string,
  pick: (s: AchievementStats) => number,
  target: number,
): AchievementDef => ({
  code,
  emoji,
  label,
  hint,
  progress: (s) => ({ current: Math.min(pick(s), target), target }),
  earned: (s) => pick(s) >= target,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  countDef('FIRST_REPORT', '🌱', '첫걸음', '첫 리포트가 게시됐어요', (s) => s.approvedReports, 1),
  {
    code: 'REPORT_STREAK_4',
    emoji: '🔥',
    label: '꾸준이',
    hint: '4주 연속 리포트 게시',
    progress: (s) => ({ current: Math.min(longestWeekStreak(s.reportWeekKeys), 4), target: 4 }),
    earned: (s) => longestWeekStreak(s.reportWeekKeys) >= 4,
  },
  {
    code: 'DECREASE_3',
    emoji: '📉',
    label: '줄임왕',
    hint: '사용시간을 3주 연속 줄였어요',
    progress: (s) => ({ current: Math.min(trailingDecreaseStreak(s.reportDiffs), 3), target: 3 }),
    earned: (s) => trailingDecreaseStreak(s.reportDiffs) >= 3,
  },
  countDef('COMMENTS_30', '💌', '응원왕', '응원 댓글 30개', (s) => s.commentsWritten, 30),
  countDef('LIKES_50', '👍', '인기글', '엄지척 50개 받기', (s) => s.likesReceived, 50),
  countDef('DEBATE_5', '💬', '토론가', '토론 5개에 참여', (s) => s.debateTopics, 5),
  countDef('BEST_OPINION', '🏅', '베스트', '베스트 의견에 뽑혔어요', (s) => s.bestOpinions, 1),
  countDef('STREAK_30', '📅', '개근이', '30일 연속 출석', (s) => s.attendanceStreak, 30),
  countDef('ARTICLES_5', '📰', '기자', '기사 5편 게시', (s) => s.approvedArticles, 5),
  countDef(
    'HALL_OF_FAME',
    '🏆',
    '명예의 전당',
    '월간 명예의 전당에 올랐어요',
    (s) => s.hallOfFame,
    1,
  ),
  countDef('READER_20', '📖', '독서가', '친구 글 20개를 끝까지 읽었어요', (s) => s.readCount, 20),
  countDef(
    'REVIEWER_20',
    '🔍',
    '검토 도우미',
    '친구 글 20개를 검토했어요',
    (s) => s.reviewsDone,
    20,
  ),
];

export const ACHIEVEMENT_BY_CODE: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.code, a]),
);

export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.earned(stats)).map((a) => a.code);
}

export function isAchievementCode(code: string): boolean {
  return ACHIEVEMENT_BY_CODE.has(code);
}

export interface TitleView {
  code: string;
  emoji: string;
  label: string;
}

export function titleOf(code: string | null): TitleView | null {
  if (!code) return null;
  const a = ACHIEVEMENT_BY_CODE.get(code);
  return a ? { code: a.code, emoji: a.emoji, label: a.label } : null;
}
