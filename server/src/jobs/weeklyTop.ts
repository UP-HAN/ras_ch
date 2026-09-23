/**
 * HOF-01 주간 TOP 배치 (매주 월요일 00:05, 지난주). 활성 3~6학년 학생 전원의 주간 원장 합계를
 * 학년별 순위와 함께 weekly_scores 에 저장하고, 반별 평균·참여율(그 주차 승인 리포트 학생 비율)을 남긴다.
 * 같은 주차는 삭제 후 재삽입(멱등). 스냅샷이 없는 지난 주차는 조회 시 즉석 생성(ensureWeeklyTop).
 */
import { query } from '../db/query.js';
import { logger } from '../lib/logger.js';
import { previousWeekKey, weekKey } from '../lib/time.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import * as weeklyRepo from '../repos/weeklyRepo.js';
import { setJobHandler } from './index.js';
import { rankWeekly } from './weeklyRank.js';

interface StudentPointsRow {
  user_id: number;
  grade: number;
  class_id: number;
  points: number | null;
  submitted: number;
}

export async function loadWeekStudents(wk: string): Promise<StudentPointsRow[]> {
  const year = await currentSchoolYear();
  if (!year) return [];
  return query<StudentPointsRow>(
    `SELECT u.id AS user_id, c.grade, c.id AS class_id,
            (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id AND l.week_key = ?) AS points,
            EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.week_key = ?
                     AND p.status = 'approved' AND p.deleted_at IS NULL) AS submitted
     FROM users u JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.status = 'active' AND c.school_year_id = ? AND c.grade BETWEEN 3 AND 6`,
    [wk, wk, year.id],
  );
}

export async function runWeeklyTop(wk: string = previousWeekKey(weekKey())): Promise<number> {
  const students = await loadWeekStudents(wk);
  const ranked = rankWeekly(
    students.map((s) => ({
      userId: s.user_id,
      grade: s.grade,
      classId: s.class_id,
      points: Number(s.points ?? 0),
    })),
  );
  const byClass = new Map<
    number,
    { grade: number; members: number; points: number; submitted: number }
  >();
  for (const s of students) {
    const c = byClass.get(s.class_id) ?? { grade: s.grade, members: 0, points: 0, submitted: 0 };
    c.members += 1;
    c.points += Number(s.points ?? 0);
    c.submitted += Number(s.submitted) ? 1 : 0;
    byClass.set(s.class_id, c);
  }
  const classes = [...byClass.entries()].map(([classId, c]) => ({
    classId,
    grade: c.grade,
    memberCount: c.members,
    avgPoints: c.members ? c.points / c.members : 0,
    participationRate: c.members ? c.submitted / c.members : 0,
  }));
  await weeklyRepo.replaceWeek(wk, ranked, classes);
  logger.info({ week: wk, students: ranked.length, classes: classes.length }, '주간 TOP 스냅샷');
  return ranked.length;
}

/** 지난 주차인데 스냅샷이 없으면 즉석 생성. 이번 주(진행 중)는 만들지 않는다 */
export async function ensureWeeklyTop(wk: string): Promise<boolean> {
  if (wk >= weekKey()) return false;
  if (await weeklyRepo.hasWeek(wk)) return true;
  await runWeeklyTop(wk);
  return true;
}

export function registerWeeklyTop(): void {
  setJobHandler('weeklyTop', async () => {
    await runWeeklyTop();
  });
}
