/**
 * 월간 결산 산식 테스트 (13장): 동점·공동 선정·연속 제한·성장률 자격·학급 동점·3부문 상한
 */
process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import { rankAwards, scoreParticipation, scorePhonefree, scoreReporter } from './awards.js';
import { rankClasses } from './classReward.js';
import { median, rankGrowth } from './growth.js';
import { assignRanks, compareStudents, rankMonthlyTop } from './monthlyTop.js';
import type { AwardStudentInput, PriorWinners, StudentMonthInput } from './types.js';

const NO_PRIOR: PriorWinners = {
  giftUserIds: new Set(),
  growthUserIds: new Set(),
  winnerClassId: null,
};

function student(
  userId: number,
  points: number,
  extra: Partial<StudentMonthInput> = {},
): StudentMonthInput {
  return {
    userId,
    grade: 4,
    classId: 41,
    points,
    prevPoints: null,
    reportCount: 0,
    articleCount: 0,
    activeDays: 0,
    parentConsent: 'Y',
    receivedWeeklyGift: false,
    ...extra,
  };
}

describe('월간 포인트 상위 (HOF-02, 03)', () => {
  it('학년별 points 내림차순, 상위 N 선정, 0P 는 미선정', () => {
    const r = rankMonthlyTop(
      [student(1, 100), student(2, 80), student(3, 0), student(4, 120, { grade: 5, classId: 51 })],
      2,
      NO_PRIOR,
    );
    const g4 = r.filter((x) => x.grade === 4);
    expect(g4.map((x) => [x.userId, x.rankInGrade, x.selected])).toEqual([
      [1, 1, true],
      [2, 2, true],
      [3, 3, false],
    ]);
    expect(r.find((x) => x.userId === 4)).toMatchObject({ rankInGrade: 1, selected: true });
  });

  it('동점: 리포트 > 기사 > 활동 일수 순으로 순위', () => {
    const r = rankMonthlyTop(
      [
        student(1, 100, { reportCount: 2, articleCount: 0, activeDays: 5 }),
        student(2, 100, { reportCount: 3, articleCount: 0, activeDays: 1 }),
        student(3, 100, { reportCount: 2, articleCount: 1, activeDays: 1 }),
      ],
      1,
      NO_PRIOR,
    );
    expect(r.map((x) => x.userId)).toEqual([2, 3, 1]);
    expect(r.map((x) => x.rankInGrade)).toEqual([1, 2, 3]);
    expect(r.filter((x) => x.selected).map((x) => x.userId)).toEqual([2]);
  });

  it('완전 동점이면 같은 순위·공동 선정 (경쟁 순위 1,1,3)', () => {
    const r = rankMonthlyTop([student(1, 100), student(2, 100), student(3, 90)], 1, NO_PRIOR);
    expect(r.map((x) => x.rankInGrade)).toEqual([1, 1, 3]);
    expect(r.filter((x) => x.selected).map((x) => x.userId)).toEqual([1, 2]);
  });

  it('연속 선정 제한(HOF-02c): 지난달 선정자는 넘기고 사유 기록, 예외 허용 시 선정', () => {
    const prior: PriorWinners = { ...NO_PRIOR, giftUserIds: new Set([1]) };
    const r = rankMonthlyTop([student(1, 100), student(2, 80), student(3, 70)], 2, prior);
    expect(r.map((x) => [x.userId, x.selected, x.skippedReason])).toEqual([
      [1, false, 'consecutive'],
      [2, true, null],
      [3, true, null],
    ]);
    const allowed = rankMonthlyTop([student(1, 100), student(2, 80), student(3, 70)], 2, prior, {
      userIds: new Set([1]),
      allowClass: false,
    });
    expect(allowed.filter((x) => x.selected).map((x) => x.userId)).toEqual([1, 2]);
  });

  it('assignRanks / compareStudents 기본', () => {
    expect(assignRanks([3, 3, 2, 1], (a, b) => b - a)).toEqual([1, 1, 3, 4]);
    expect(compareStudents(student(1, 10), student(2, 10))).toBe(0);
  });
});

describe('성장률 부문 (HOF-02b)', () => {
  const inputs = [
    student(1, 200, { prevPoints: 100 }), // +100% 지만 선물 대상
    student(2, 150, { prevPoints: 50 }), // +200%
    student(3, 90, { prevPoints: 60 }), // +50%
    student(4, 40, { prevPoints: 20 }), // 지난달 30 미만 → 자격 없음
    student(5, 30, { prevPoints: 30 }), // 0% → 제외
    student(6, 10, { prevPoints: 100 }), // 음수 → 제외
  ];
  const gift = rankMonthlyTop(inputs, 1, NO_PRIOR); // 1번만 선물 대상
  const settings = { perGradeGrowthCount: 2, growthMinPrevPoints: 30, isFirstMonth: false };

  it('자격: 지난달 30P+, 이번 달 학년 중앙값 이상, 선물 대상 제외', () => {
    // 중앙값: [10,30,40,90,150,200] → (40+90)/2 = 65
    expect(median(inputs.map((s) => s.points))).toBe(65);
    const r = rankGrowth(inputs, gift, settings, NO_PRIOR);
    const selected = r.filter((x) => x.selected).map((x) => x.userId);
    expect(selected).toEqual([2, 3]);
    expect(r.find((x) => x.userId === 1)).toMatchObject({
      selected: false,
      skippedReason: 'gift_target',
      growthRate: 1,
    });
    expect(r.find((x) => x.userId === 2)?.growthRate).toBe(2);
    expect(r.some((x) => x.userId === 4)).toBe(false);
  });

  it('첫 달은 미운영', () => {
    expect(rankGrowth(inputs, gift, { ...settings, isFirstMonth: true }, NO_PRIOR)).toEqual([]);
  });

  it('연속 선정 제한: 지난달 성장률 선정자는 넘김', () => {
    const r = rankGrowth(inputs, gift, settings, { ...NO_PRIOR, growthUserIds: new Set([2]) });
    expect(r.find((x) => x.userId === 2)).toMatchObject({
      selected: false,
      skippedReason: 'consecutive',
    });
    expect(r.filter((x) => x.selected).map((x) => x.userId)).toEqual([3]);
  });
});

describe('학급 보상 (HOF-02a)', () => {
  const classes = [
    { classId: 31, grade: 3, memberCount: 8, avgPoints: 50, participationRate: 0.5 },
    { classId: 41, grade: 4, memberCount: 8, avgPoints: 50, participationRate: 0.75 },
    { classId: 51, grade: 5, memberCount: 7, avgPoints: 40, participationRate: 1 },
  ];
  it('평균 1위, 동점이면 참여율 우선', () => {
    const r = rankClasses(classes, NO_PRIOR);
    expect(r.map((c) => [c.classId, c.rankOverall, c.isWinner])).toEqual([
      [41, 1, true],
      [31, 2, false],
      [51, 3, false],
    ]);
  });
  it('연속 선정이면 넘기고 다음 반, 예외 허용 시 그대로', () => {
    const r = rankClasses(classes, { ...NO_PRIOR, winnerClassId: 41 });
    expect(r[0]).toMatchObject({ classId: 41, isWinner: false, skippedReason: 'consecutive' });
    expect(r[1]).toMatchObject({ classId: 31, isWinner: true });
    expect(rankClasses(classes, { ...NO_PRIOR, winnerClassId: 41 }, true)[0]).toMatchObject({
      classId: 41,
      isWinner: true,
    });
  });
});

describe('3부문 점수 (7.2~7.4, HOF-04, 08)', () => {
  const base: AwardStudentInput = {
    userId: 1,
    grade: 4,
    reportCount: 0,
    articleCount: 0,
    firstReportMinutes: null,
    lastReportMinutes: null,
    teacherScore: null,
    reportReactions: 0,
    articleLikes: 0,
    articleComments: 0,
    featuredCount: 0,
    commentsWritten: 0,
    likesGiven: 0,
    commentLikesReceived: 0,
    attendanceDays: 0,
    readCount: 0,
    newsVoteTopics: 0,
    bestOpinions: 0,
  };

  it('실천왕: 리포트 3건 미만 자격 없음, 변화 최대 40, 성찰 기본 20, 공감 최대 20', () => {
    expect(scorePhonefree({ ...base, reportCount: 2 })).toBeNull();
    const s = scorePhonefree({
      ...base,
      reportCount: 4,
      firstReportMinutes: 200,
      lastReportMinutes: 50,
      reportReactions: 35,
    });
    expect(s).toEqual({
      score: 40 + 40 + 20 + 20,
      breakdown: { 성실성: 40, 변화: 40, 성찰: 20, 공감: 20 },
    });
    const s2 = scorePhonefree({
      ...base,
      reportCount: 3,
      firstReportMinutes: 100,
      lastReportMinutes: 120,
      teacherScore: 3,
    });
    expect(s2?.breakdown).toEqual({ 성실성: 30, 변화: 0, 성찰: 30, 공감: 0 });
  });

  it('기자: 기사 1건+ 자격, 상한 40/40/20, 추천 +20', () => {
    expect(scoreReporter(base)).toBeNull();
    expect(
      scoreReporter({
        ...base,
        articleCount: 6,
        articleLikes: 55,
        articleComments: 30,
        featuredCount: 1,
      }),
    ).toEqual({
      score: 40 + 40 + 20 + 20,
      breakdown: { 기사수: 40, 엄지척: 40, 댓글: 20, 추천기사: 20 },
    });
  });

  it('참여왕: 글 2건 이상이면 자격 없음, 읽기·출석 상한', () => {
    expect(scoreParticipation({ ...base, reportCount: 1, articleCount: 1 })).toBeNull();
    expect(
      scoreParticipation({
        ...base,
        reportCount: 1,
        commentsWritten: 30,
        likesGiven: 40,
        commentLikesReceived: 20,
        attendanceDays: 30,
        readCount: 100,
      }),
    ).toEqual({
      score: 60 + 30 + 30 + 25 + 20,
      breakdown: {
        댓글: 60,
        좋아요누름: 30,
        댓글좋아요: 30,
        토론투표: 0,
        베스트의견: 0,
        출석: 25,
        읽기: 20,
      },
    });
    // NWS: 투표 주제 12개 → 20 상한, 베스트 3개 → 20 상한
    expect(scoreParticipation({ ...base, newsVoteTopics: 12, bestOpinions: 3 })).toEqual({
      score: 40,
      breakdown: {
        댓글: 0,
        좋아요누름: 0,
        댓글좋아요: 0,
        토론투표: 20,
        베스트의견: 20,
        출석: 0,
        읽기: 0,
      },
    });
  });

  it('학년별 상위 N 후보 + 중복 부문 경고', () => {
    const inputs: AwardStudentInput[] = [
      { ...base, userId: 1, reportCount: 3, articleCount: 2, articleLikes: 10 }, // 실천왕 + 기자
      { ...base, userId: 2, reportCount: 3 },
      { ...base, userId: 3, commentsWritten: 5, attendanceDays: 10 }, // 참여왕
      { ...base, userId: 4, grade: 5, reportCount: 5 },
    ];
    const r = rankAwards(inputs, 5);
    const phonefree4 = r.filter((c) => c.category === 'phonefree' && c.grade === 4);
    expect(phonefree4.map((c) => [c.userId, c.rankInGrade])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(r.find((c) => c.category === 'reporter')?.userId).toBe(1);
    expect(r.find((c) => c.category === 'participation')?.userId).toBe(3);
    expect(r.find((c) => c.category === 'reporter')?.warnings[0]).toContain('폰프리 실천왕');
    expect(r.find((c) => c.category === 'participation')?.warnings).toEqual([]);
    expect(r.filter((c) => c.grade === 5)).toHaveLength(1);
  });
});
