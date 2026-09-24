/**
 * 명예의 전당 (HOF-01, 06): 주간 TOP / 월간 / 학급 / 역대. 학생 뷰는 마스킹 이름·순위 없음(HOF-01 확정)
 */
import { AppError } from '../lib/apiResponse.js';
import {
  isWeekKey,
  monthKey as currentMonthKey,
  previousMonthKey,
  previousWeekKey,
  weekKey as currentWeekKey,
  weekRange,
} from '../lib/time.js';
import { isTeacherLike, viewerFromAuthUser } from '../lib/postAccess.js';
import { ensureWeeklyTop } from '../jobs/weeklyTop.js';
import { topPerGrade } from '../jobs/weeklyRank.js';
import * as settlementRepo from '../repos/settlementRepo.js';
import { getSetting } from '../repos/settingsRepo.js';
import * as weeklyRepo from '../repos/weeklyRepo.js';
import * as weeklyGiftRepo from '../repos/weeklyGiftRepo.js';
import type { AuthUser } from '../types/auth.js';
import type {
  AllTimeView,
  ClassHallView,
  HallStudent,
  MonthlyHallView,
  WeeklyTopView,
} from '../types/api.js';
import { toHallAward, toHallClass, toHallStudent } from './settlement/views.js';

const nextWeekKeyOf = (wk: string): string | null => {
  const next = currentWeekKey(weekRange(wk).end);
  return next < currentWeekKey() ? next : null;
};
const nextMonthKeyOf = (mk: string): string | null => {
  const [y, m] = mk.split('-').map(Number) as [number, number];
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  return next < currentMonthKey() ? next : null;
};
const byKoreanName = (a: HallStudent, b: HallStudent) =>
  a.displayName.localeCompare(b.displayName, 'ko');

export async function weeklyTop(user: AuthUser, week?: string): Promise<WeeklyTopView> {
  const teacher = isTeacherLike(viewerFromAuthUser(user));
  const wk = week ?? previousWeekKey(currentWeekKey());
  if (!isWeekKey(wk)) throw AppError.badRequest('주차 형식이 올바르지 않아요.');
  if (wk >= currentWeekKey())
    throw AppError.badRequest('이번 주는 아직 집계 전이에요. 월요일에 올라와요.');
  await ensureWeeklyTop(wk);
  const perGrade = await getSetting('weekly_top_per_grade', 10);
  const gifted = await weeklyGiftRepo.giftedUserIds(wk); // HOF-01a 🎁
  const rows = await weeklyRepo.listWeekScores(wk);
  const top = topPerGrade(
    rows.filter((r) => r.points > 0).map((r) => ({ ...r, rankInGrade: r.rank_in_grade })),
    perGrade,
  );
  const grades = [...new Set(rows.map((r) => r.grade))]
    .sort((a, b) => a - b)
    .map((grade) => {
      const students = top
        .filter((r) => r.grade === grade)
        .map((r) => ({
          ...toHallStudent(r, teacher, { rank: r.rank_in_grade, points: r.points }),
          gifted: gifted.has(r.user_id),
        }));
      return { grade, students: teacher ? students : students.sort(byKoreanName) };
    });
  return {
    weekKey: wk,
    prevWeekKey: previousWeekKey(wk),
    nextWeekKey: nextWeekKeyOf(wk),
    showRank: teacher,
    perGrade,
    grades,
    classes: (await weeklyRepo.listWeekClasses(wk)).map(toHallClass),
  };
}

export async function monthly(user: AuthUser, month?: string): Promise<MonthlyHallView> {
  const teacher = isTeacherLike(viewerFromAuthUser(user));
  const mk = month ?? previousMonthKey(currentMonthKey());
  if (!/^\d{4}-\d{2}$/.test(mk)) throw AppError.badRequest('월 형식이 올바르지 않아요.');
  const row = await settlementRepo.findByMonth(mk);
  const base = {
    monthKey: mk,
    prevMonthKey: previousMonthKey(mk),
    nextMonthKey: nextMonthKeyOf(mk),
  };
  if (!row || row.status !== 'confirmed')
    return {
      ...base,
      confirmed: false,
      giftTargets: [],
      growth: [],
      awards: [],
      winnerClass: null,
    };
  const scores = await settlementRepo.listScores(row.id);
  const classes = await settlementRepo.listClassScores(row.id);
  const awards = await settlementRepo.listAwards(mk);
  const grades = [...new Set(scores.map((s) => s.grade))].sort((a, b) => a - b);
  const student = (s: settlementRepo.ScoreRow) =>
    toHallStudent(s, teacher, { rank: s.rank_in_grade, points: s.points });
  return {
    ...base,
    confirmed: true,
    giftTargets: grades.map((grade) => {
      const list = scores.filter((s) => s.grade === grade && s.is_gift_target === 1).map(student);
      return { grade, students: teacher ? list : list.sort(byKoreanName) };
    }),
    growth: grades
      .map((grade) => ({
        grade,
        students: scores
          .filter((s) => s.grade === grade && s.is_growth_target === 1)
          .map((s) =>
            teacher ? { ...student(s), growthRate: Number(s.growth_rate ?? 0) } : student(s),
          )
          .sort(byKoreanName),
      }))
      .filter((g) => g.students.length > 0),
    awards: awards
      .filter((a) => a.status === 'selected' && a.category !== 'growth')
      .map((a) => toHallAward(a, teacher)),
    winnerClass: (() => {
      const w = classes.find((c) => c.is_winner === 1);
      return w ? toHallClass(w) : null;
    })(),
  };
}

export async function classHall(): Promise<ClassHallView> {
  const confirmed = await settlementRepo.listConfirmed();
  const months: ClassHallView['months'] = [];
  for (const s of confirmed) {
    const w = (await settlementRepo.listClassScores(s.id)).find((c) => c.is_winner === 1);
    if (w) months.push({ monthKey: s.month_key, ...toHallClass(w) });
  }
  const wk = previousWeekKey(currentWeekKey());
  await ensureWeeklyTop(wk);
  const classes = (await weeklyRepo.listWeekClasses(wk)).map(toHallClass);
  return { months, latestWeek: classes.length ? { weekKey: wk, classes } : null };
}

export async function allTime(user: AuthUser): Promise<AllTimeView> {
  const teacher = isTeacherLike(viewerFromAuthUser(user));
  const confirmed = await settlementRepo.listConfirmed();
  const months: AllTimeView['months'] = [];
  for (const s of confirmed) {
    const awards = (await settlementRepo.listAwards(s.month_key)).filter(
      (a) => a.status === 'selected',
    );
    const scores = await settlementRepo.listScores(s.id);
    const w = (await settlementRepo.listClassScores(s.id)).find((c) => c.is_winner === 1);
    months.push({
      monthKey: s.month_key,
      awards: awards.map((a) => toHallAward(a, teacher)),
      giftCount: scores.filter((x) => x.is_gift_target === 1).length,
      winnerClass: w ? toHallClass(w) : null,
    });
  }
  return { months };
}
