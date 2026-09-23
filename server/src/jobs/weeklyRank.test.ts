process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import { rankWeekly, topPerGrade } from './weeklyRank.js';

describe('주간 TOP 순위 (HOF-01)', () => {
  it('학년별 내림차순·경쟁 순위·상위 N 은 동점 포함', () => {
    const r = rankWeekly([
      { userId: 1, grade: 3, classId: 31, points: 10 },
      { userId: 2, grade: 3, classId: 31, points: 30 },
      { userId: 3, grade: 3, classId: 31, points: 30 },
      { userId: 4, grade: 3, classId: 31, points: 0 },
      { userId: 5, grade: 4, classId: 41, points: 5 },
    ]);
    expect(r.filter((x) => x.grade === 3).map((x) => [x.userId, x.rankInGrade])).toEqual([
      [2, 1],
      [3, 1],
      [1, 3],
      [4, 4],
    ]);
    expect(r.find((x) => x.userId === 5)?.rankInGrade).toBe(1);
    expect(topPerGrade(r, 1).map((x) => x.userId)).toEqual([2, 3, 5]);
  });
});
