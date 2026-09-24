process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  longestWeekStreak,
  titleOf,
  trailingDecreaseStreak,
  type AchievementStats,
} from './achievements.js';
import { buildMissions, classMission, missionsDone } from './missions.js';
import { nextTierInfo, resolveTier, tierFor } from './tiers.js';
import { selectGiftTargets, weekKeysInMonth } from './weeklyGift.js';
import { validateCouncilInput } from './councilRules.js';
import { rankMonthlyTop } from '../services/settlement/monthlyTop.js';
import type { StudentMonthInput } from '../services/settlement/types.js';

const zero: AchievementStats = {
  approvedReports: 0,
  reportWeekKeys: [],
  reportDiffs: [],
  commentsWritten: 0,
  likesReceived: 0,
  debateTopics: 0,
  bestOpinions: 0,
  attendanceStreak: 0,
  approvedArticles: 0,
  hallOfFame: 0,
  readCount: 0,
  reviewsDone: 0,
};

describe('칭호·업적 판정', () => {
  it('12개 정의, 0 통계면 아무것도 없음', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    expect(evaluateAchievements(zero)).toEqual([]);
  });
  it('개수형: 첫 리포트·응원왕·인기글·토론가·베스트·개근·기자·명예·독서가·검토', () => {
    const s: AchievementStats = {
      ...zero,
      approvedReports: 1,
      commentsWritten: 30,
      likesReceived: 50,
      debateTopics: 5,
      bestOpinions: 1,
      attendanceStreak: 30,
      approvedArticles: 5,
      hallOfFame: 1,
      readCount: 20,
      reviewsDone: 20,
    };
    expect(evaluateAchievements(s)).toEqual([
      'FIRST_REPORT',
      'COMMENTS_30',
      'LIKES_50',
      'DEBATE_5',
      'BEST_OPINION',
      'STREAK_30',
      'ARTICLES_5',
      'HALL_OF_FAME',
      'READER_20',
      'REVIEWER_20',
    ]);
    expect(evaluateAchievements({ ...zero, commentsWritten: 29 })).toEqual([]);
  });
  it('꾸준이: 4주 연속(중간에 빠지면 끊김), 연말 경계 W52→W01 이어짐', () => {
    expect(longestWeekStreak(['2026-W36', '2026-W37', '2026-W38', '2026-W39'])).toBe(4);
    expect(longestWeekStreak(['2026-W36', '2026-W37', '2026-W39', '2026-W40'])).toBe(2);
    expect(longestWeekStreak(['2026-W52', '2027-W01', '2027-W02'])).toBe(3);
    expect(
      evaluateAchievements({
        ...zero,
        reportWeekKeys: ['2026-W36', '2026-W37', '2026-W38', '2026-W39'],
      }),
    ).toContain('REPORT_STREAK_4');
  });
  it('줄임왕: 마지막부터 3주 연속 감소', () => {
    expect(trailingDecreaseStreak([null, -10, -5, -1])).toBe(3);
    expect(trailingDecreaseStreak([-10, -5, 3])).toBe(0);
    expect(evaluateAchievements({ ...zero, reportDiffs: [-1, -2, -3] })).toContain('DECREASE_3');
  });
  it('진행률·칭호 뷰', () => {
    const a = ACHIEVEMENTS.find((x) => x.code === 'COMMENTS_30');
    expect(a?.progress({ ...zero, commentsWritten: 12 })).toEqual({ current: 12, target: 30 });
    expect(titleOf('LIKES_50')).toEqual({ code: 'LIKES_50', emoji: '👍', label: '인기글' });
    expect(titleOf('NOPE')).toBeNull();
    expect(titleOf(null)).toBeNull();
  });
});

describe('등급 (PT-07)', () => {
  it('구간 계산·다음 등급까지', () => {
    expect(tierFor(0)).toBe('seed');
    expect(tierFor(199)).toBe('seed');
    expect(tierFor(200)).toBe('sprout');
    expect(tierFor(2000)).toBe('star');
    expect(nextTierInfo(120, 'seed')).toEqual({ next: 'sprout', needed: 80, from: 0, to: 200 });
    expect(nextTierInfo(2500, 'star')).toBeNull();
  });
  it('강등 없음', () => {
    expect(resolveTier(150, 'sprout')).toBe('sprout');
    expect(resolveTier(600, 'sprout')).toBe('flower');
  });
});

describe('미션', () => {
  it('개인 미션 3개, 토론 없으면 엄지척으로 대체', () => {
    const m = buildMissions({
      reportSubmitted: true,
      commentsThisWeek: 0,
      likesGivenThisWeek: 0,
      debateActionsThisWeek: 1,
      debateAvailable: true,
    });
    expect(m.map((x) => x.code)).toEqual(['report', 'comment', 'debate']);
    expect(missionsDone(m)).toBe(2);
    const m2 = buildMissions({
      reportSubmitted: false,
      commentsThisWeek: 2,
      likesGivenThisWeek: 5,
      debateActionsThisWeek: 0,
      debateAvailable: false,
    });
    expect(m2[2]).toMatchObject({ code: 'likes', current: 3, target: 3, done: true });
  });
  it('학급 미션 제출률', () => {
    expect(classMission({ students: 8, submitted: 7, targetPct: 80 })).toMatchObject({
      ratePct: 88,
      achieved: true,
    });
    expect(classMission({ students: 8, submitted: 6, targetPct: 80 })).toMatchObject({
      ratePct: 75,
      achieved: false,
    });
    expect(classMission({ students: 0, submitted: 0, targetPct: 80 }).achieved).toBe(false);
  });
});

describe('주간 선물 대상 (HOF-01a)', () => {
  const rows = [
    { userId: 1, grade: 3, points: 50, rankInGrade: 1 },
    { userId: 2, grade: 3, points: 40, rankInGrade: 2 },
    { userId: 3, grade: 3, points: 40, rankInGrade: 2 },
    { userId: 4, grade: 3, points: 10, rankInGrade: 4 },
    { userId: 5, grade: 4, points: 0, rankInGrade: 1 },
  ];
  it('상위 N 동점 포함, 0P 제외, 개별 선택 합집합', () => {
    expect(selectGiftTargets(rows, 2).map((x) => x.userId)).toEqual([1, 2, 3]);
    expect(selectGiftTargets(rows, 0, [4, 99])).toEqual([{ userId: 4, method: 'manual' }]);
    expect(selectGiftTargets(rows, 1, [1, 4])).toEqual([
      { userId: 1, method: 'top_n' },
      { userId: 4, method: 'manual' },
    ]);
  });
});

describe('주간 선물 결산 제외 (HOF-01b)', () => {
  const st = (userId: number, points: number, receivedWeeklyGift = false): StudentMonthInput => ({
    userId,
    grade: 4,
    classId: 41,
    points,
    prevPoints: null,
    reportCount: 0,
    articleCount: 0,
    activeDays: 0,
    parentConsent: 'Y',
    receivedWeeklyGift,
  });
  const prior = {
    giftUserIds: new Set<number>(),
    growthUserIds: new Set<number>(),
    winnerClassId: null,
  };
  it('토글 꺼짐이면 수령자도 선정, 켜지면 넘기고 사유 weekly_gift', () => {
    const off = rankMonthlyTop([st(1, 100, true), st(2, 90), st(3, 80)], 1, prior);
    expect(off.find((r) => r.userId === 1)?.selected).toBe(true);
    const on = rankMonthlyTop([st(1, 100, true), st(2, 90), st(3, 80)], 1, prior, undefined, true);
    expect(on.find((r) => r.userId === 1)).toMatchObject({
      selected: false,
      skippedReason: 'weekly_gift',
    });
    expect(on.find((r) => r.userId === 2)?.selected).toBe(true);
  });
  it('이 달의 주차 키(월요일 기준)', () => {
    expect(weekKeysInMonth('2026-09')).toEqual(['2026-W37', '2026-W38', '2026-W39', '2026-W40']);
    expect(weekKeysInMonth('2026-10')).toEqual(['2026-W41', '2026-W42', '2026-W43', '2026-W44']);
  });
});

describe('자치회 글 입력 검증 (CNC-01, 02)', () => {
  const base = {
    type: 'notice' as const,
    title: '10월 폰프리 챌린지',
    body: '다 같이 폰 없는 점심시간을 해 봐요. 참여하면 스티커!',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2026-10-15T00:00:00.000Z',
    pinRequested: false,
    allowComments: true,
    pollOptions: [],
    pollShowBeforeClose: false,
    submit: true,
  };
  it('정상 입력은 null', () => expect(validateCouncilInput(base)).toBeNull());
  it('제목·내용·기간·선택지 검사', () => {
    expect(validateCouncilInput({ ...base, title: '가' })).toMatch(/제목/);
    expect(validateCouncilInput({ ...base, body: '짧아요' })).toMatch(/내용/);
    expect(validateCouncilInput({ ...base, endsAt: '2026-09-30T00:00:00.000Z' })).toMatch(/뒤여야/);
    expect(validateCouncilInput({ ...base, endsAt: '2026-12-31T00:00:00.000Z' })).toMatch(/60일/);
    expect(validateCouncilInput({ ...base, type: 'poll', pollOptions: ['찬성'] })).toMatch(
      /선택지/,
    );
    expect(validateCouncilInput({ ...base, type: 'poll', pollOptions: ['찬성', '찬성'] })).toMatch(
      /같은 선택지/,
    );
    expect(
      validateCouncilInput({ ...base, type: 'poll', pollOptions: ['체육대회', '축제', '캠프'] }),
    ).toBeNull();
  });
});
