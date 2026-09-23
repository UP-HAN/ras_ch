/**
 * 출석 (PT-09): 하루 첫 API 호출 시 login_days 기록 + DAILY_LOGIN, 7일 연속마다 STREAK_7
 * 기준은 Asia/Seoul 00:00. 학생만.
 */
import { isStreakBonusDay, streakBlockKey, streakFrom } from '../lib/attendance.js';
import { dayKey } from '../lib/time.js';
import * as repo from '../repos/attendanceRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { AttendanceView } from '../types/api.js';
import { applyPointsSafe } from './points/safeApply.js';

export async function touchAttendance(
  user: AuthUser,
): Promise<{ firstToday: boolean; streak: number }> {
  if (user.row.role !== 'student') return { firstToday: false, streak: 0 };
  const today = dayKey();
  const loginDayId = await repo.insertLoginDay(user.row.id, today);
  const days = await repo.recentLoginDays(user.row.id, 60);
  const streak = streakFrom(days, today);
  if (loginDayId !== null) {
    await applyPointsSafe({
      ruleCode: 'DAILY_LOGIN',
      userId: user.row.id,
      refType: 'login_day',
      refId: loginDayId,
      eventKey: `DAILY_LOGIN:${user.row.id}:${today}`,
    });
    if (isStreakBonusDay(streak)) {
      await applyPointsSafe({
        ruleCode: 'STREAK_7',
        userId: user.row.id,
        refType: 'login_day',
        refId: loginDayId,
        eventKey: `STREAK_7:${user.row.id}:${streakBlockKey(today, streak)}`,
        note: `${streak}일 연속 출석`,
      });
    }
  }
  return { firstToday: loginDayId !== null, streak };
}

export async function attendanceSummary(user: AuthUser): Promise<AttendanceView> {
  const today = dayKey();
  const days = await repo.recentLoginDays(user.row.id, 60);
  return {
    days: await repo.countLoginDays(user.row.id),
    streak: streakFrom(days, today),
    todayDone: days.includes(today),
  };
}
