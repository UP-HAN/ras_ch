import type { RequestHandler } from 'express';
import { dayKey } from '../lib/time.js';
import { logger } from '../lib/logger.js';
import { touchAttendance } from '../services/AttendanceService.js';

declare module 'express-session' {
  interface SessionData {
    /** 오늘 출석 처리를 마친 날짜(KST). 하루 한 번만 DB 에 닿게 한다 */
    attendanceDay?: string;
  }
}

/** 로그인된 학생의 첫 API 호출에서 출석 처리 (PT-09). 실패해도 요청은 계속 */
export const attendance: RequestHandler = async (req, _res, next) => {
  const user = req.user;
  if (!user || user.row.role !== 'student' || user.row.must_change_pw === 1) return next();
  const today = dayKey();
  if (req.session.attendanceDay === today) return next();
  try {
    await touchAttendance(user);
    req.session.attendanceDay = today;
  } catch (err) {
    logger.warn({ err, userId: user.row.id }, '출석 처리 실패');
  }
  next();
};
