/**
 * 결산 입력 집계 — DB 를 아는 유일한 곳 (README 원칙 1)
 *  - 포인트: point_ledger.month_key SUM (리포트 승인 포인트는 그 주차 월요일이 속한 달 — 2026-09-24 사용자 결정)
 *  - 리포트·기사 수, 3부문 활동: 그 달(approved_at / created_at) 기준
 *  - 지난달 선정자: 지난달 **확정** 결산 스냅샷
 */
import { query, queryOne } from '../../db/query.js';
import { monthRange, previousMonthKey } from '../../lib/time.js';
import { currentSchoolYear } from '../../repos/schoolYearRepo.js';
import * as settlementRepo from '../../repos/settlementRepo.js';
import { getSetting } from '../../repos/settingsRepo.js';
import * as weeklyGiftRepo from '../../repos/weeklyGiftRepo.js';
import { weekKeysInMonth } from '../../lib/weeklyGift.js';
import type {
  AwardStudentInput,
  ClassMonthInput,
  PriorWinners,
  SettlementSettings,
  StudentMonthInput,
} from './types.js';

interface StudentRow {
  user_id: number;
  grade: number;
  class_id: number;
  parent_consent: 'Y' | 'N';
  points: number | null;
  prev_points: number | null;
  report_count: number;
  article_count: number;
  active_days: number;
}

export async function loadStudentInputs(monthKey: string): Promise<StudentMonthInput[]> {
  const year = await currentSchoolYear();
  if (!year) return [];
  const prev = previousMonthKey(monthKey);
  const { start, end } = monthRange(monthKey);
  const s = start.format('YYYY-MM-DD HH:mm:ss');
  const e = end.format('YYYY-MM-DD HH:mm:ss');
  const rows = await query<StudentRow>(
    `SELECT u.id AS user_id, c.grade, c.id AS class_id, u.parent_consent,
            (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id AND l.month_key = ?) AS points,
            (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id AND l.month_key = ?) AS prev_points,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.status = 'approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS report_count,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type = 'article' AND p.status = 'approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS article_count,
            (SELECT COUNT(*) FROM login_days d WHERE d.user_id = u.id AND d.day_key >= ? AND d.day_key < ?) AS active_days
     FROM users u JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.status = 'active' AND c.school_year_id = ? AND c.grade BETWEEN 3 AND 6`,
    [monthKey, prev, s, e, s, e, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'), year.id],
  );
  const gifted = await weeklyGiftRepo.giftedUserIdsForWeeks(weekKeysInMonth(monthKey));
  return rows.map((r) => ({
    userId: r.user_id,
    grade: r.grade,
    classId: r.class_id,
    points: Number(r.points ?? 0),
    prevPoints: r.prev_points === null ? null : Number(r.prev_points),
    reportCount: Number(r.report_count),
    articleCount: Number(r.article_count),
    activeDays: Number(r.active_days),
    parentConsent: r.parent_consent,
    receivedWeeklyGift: gifted.has(r.user_id),
  }));
}

/** 반 입력: 평균은 동의 Y 학생만(재적 기준), 참여율은 반 전체 중 승인 리포트(일기 포함) 학생 비율 */
export function buildClassInputs(students: StudentMonthInput[]): ClassMonthInput[] {
  const byClass = new Map<number, StudentMonthInput[]>();
  for (const s of students) byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]);
  return [...byClass.entries()].map(([classId, list]) => {
    const members = list.filter((s) => s.parentConsent === 'Y');
    const first = list[0] as StudentMonthInput;
    return {
      classId,
      grade: first.grade,
      memberCount: members.length,
      avgPoints: members.length
        ? Math.round((members.reduce((a, s) => a + s.points, 0) / members.length) * 100) / 100
        : 0,
      participationRate: list.length
        ? Math.round((list.filter((s) => s.reportCount > 0).length / list.length) * 100) / 100
        : 0,
    };
  });
}

export async function loadPriorWinners(
  monthKey: string,
): Promise<{ prior: PriorWinners; prevSettlementId: number | null }> {
  const prev = await settlementRepo.findByMonth(previousMonthKey(monthKey));
  if (!prev || prev.status !== 'confirmed') {
    return {
      prior: { giftUserIds: new Set(), growthUserIds: new Set(), winnerClassId: null },
      prevSettlementId: prev?.id ?? null,
    };
  }
  const rows = await query<{ user_id: number; is_gift_target: 0 | 1; is_growth_target: 0 | 1 }>(
    'SELECT user_id, is_gift_target, is_growth_target FROM monthly_scores WHERE settlement_id = ? AND (is_gift_target = 1 OR is_growth_target = 1)',
    [prev.id],
  );
  return {
    prevSettlementId: prev.id,
    prior: {
      giftUserIds: new Set(rows.filter((r) => r.is_gift_target === 1).map((r) => r.user_id)),
      growthUserIds: new Set(rows.filter((r) => r.is_growth_target === 1).map((r) => r.user_id)),
      winnerClassId: prev.winner_class_id,
    },
  };
}

export async function loadSettings(monthKey: string): Promise<SettlementSettings> {
  const prev = previousMonthKey(monthKey);
  const prevTotal = await queryOne<{ s: number | null }>(
    'SELECT SUM(amount) AS s FROM point_ledger WHERE month_key = ?',
    [prev],
  );
  return {
    perGradeGiftCount: await getSetting('monthly_gift_per_grade', 5),
    perGradeGrowthCount: await getSetting('monthly_growth_per_grade', 3),
    growthMinPrevPoints: await getSetting('growth_min_prev_points', 30),
    excludeWeeklyGift: (await settlementRepo.findByMonth(monthKey))?.exclude_weekly_gift === 1,
    isFirstMonth: Number(prevTotal?.s ?? 0) <= 0,
  };
}

interface AwardRow {
  user_id: number;
  grade: number;
  report_count: number;
  article_count: number;
  first_minutes: number | null;
  last_minutes: number | null;
  teacher_score: number | null;
  report_reactions: number | null;
  article_likes: number | null;
  article_comments: number | null;
  featured_count: number;
  comments_written: number;
  likes_given: number;
  comment_likes_received: number;
  attendance_days: number;
  read_count: number;
  news_vote_topics: number;
  best_opinions: number;
}

export async function loadAwardInputs(monthKey: string): Promise<AwardStudentInput[]> {
  const year = await currentSchoolYear();
  if (!year) return [];
  const { start, end } = monthRange(monthKey);
  const s = start.format('YYYY-MM-DD HH:mm:ss');
  const e = end.format('YYYY-MM-DD HH:mm:ss');
  const rows = await query<AwardRow>(
    `SELECT u.id AS user_id, c.grade,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS report_count,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type = 'article' AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS article_count,
      (SELECT rd.avg_minutes_per_day FROM posts p JOIN report_details rd ON rd.post_id = p.id WHERE p.author_id = u.id AND p.type='report' AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ? ORDER BY p.week_key ASC LIMIT 1) AS first_minutes,
      (SELECT rd.avg_minutes_per_day FROM posts p JOIN report_details rd ON rd.post_id = p.id WHERE p.author_id = u.id AND p.type='report' AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ? ORDER BY p.week_key DESC LIMIT 1) AS last_minutes,
      (SELECT AVG(rd.teacher_score) FROM posts p JOIN report_details rd ON rd.post_id = p.id WHERE p.author_id = u.id AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ? AND rd.teacher_score IS NOT NULL) AS teacher_score,
      (SELECT SUM(p.like_count + p.comment_count) FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS report_reactions,
      (SELECT SUM(p.like_count) FROM posts p WHERE p.author_id = u.id AND p.type='article' AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS article_likes,
      (SELECT SUM(p.comment_count) FROM posts p WHERE p.author_id = u.id AND p.type='article' AND p.status='approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?) AS article_comments,
      (SELECT COUNT(*) FROM posts p JOIN article_details ad ON ad.post_id = p.id WHERE p.author_id = u.id AND p.status='approved' AND p.deleted_at IS NULL AND ad.is_featured = 1 AND p.approved_at >= ? AND p.approved_at < ?) AS featured_count,
      (SELECT COUNT(*) FROM comments cm WHERE cm.author_id = u.id AND cm.status = 'visible' AND cm.created_at >= ? AND cm.created_at < ?) AS comments_written,
      (SELECT COUNT(*) FROM likes lk WHERE lk.user_id = u.id AND lk.created_at >= ? AND lk.created_at < ?) AS likes_given,
      (SELECT COALESCE(SUM(cm.like_count),0) FROM comments cm WHERE cm.author_id = u.id AND cm.status = 'visible' AND cm.created_at >= ? AND cm.created_at < ?) AS comment_likes_received,
      (SELECT COUNT(*) FROM login_days d WHERE d.user_id = u.id AND d.day_key >= ? AND d.day_key < ?) AS attendance_days,
      (SELECT COUNT(*) FROM post_reads r WHERE r.user_id = u.id AND r.completed_at IS NOT NULL AND r.completed_at >= ? AND r.completed_at < ?) AS read_count,
      (SELECT COUNT(DISTINCT v.topic_id) FROM news_votes v WHERE v.user_id = u.id AND v.created_at >= ? AND v.created_at < ?) AS news_vote_topics,
      (SELECT COUNT(*) FROM news_best_opinions b WHERE b.user_id = u.id AND b.created_at >= ? AND b.created_at < ?) AS best_opinions
     FROM users u JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.status = 'active' AND c.school_year_id = ? AND c.grade BETWEEN 3 AND 6`,
    [
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      s,
      e,
      start.format('YYYY-MM-DD'),
      end.format('YYYY-MM-DD'),
      s,
      e,
      s,
      e,
      s,
      e,
      year.id,
    ],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    grade: r.grade,
    reportCount: Number(r.report_count),
    articleCount: Number(r.article_count),
    firstReportMinutes: r.first_minutes === null ? null : Number(r.first_minutes),
    lastReportMinutes: r.last_minutes === null ? null : Number(r.last_minutes),
    teacherScore: r.teacher_score === null ? null : Number(r.teacher_score),
    reportReactions: Number(r.report_reactions ?? 0),
    articleLikes: Number(r.article_likes ?? 0),
    articleComments: Number(r.article_comments ?? 0),
    featuredCount: Number(r.featured_count),
    commentsWritten: Number(r.comments_written),
    likesGiven: Number(r.likes_given),
    commentLikesReceived: Number(r.comment_likes_received),
    attendanceDays: Number(r.attendance_days),
    readCount: Number(r.read_count),
    newsVoteTopics: Number(r.news_vote_topics),
    bestOpinions: Number(r.best_opinions),
  }));
}
