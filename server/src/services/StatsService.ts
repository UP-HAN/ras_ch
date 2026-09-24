/**
 * 통계 (TCH-01 반 대시보드, TCH-05 반 통계 CSV, ADM-05 전교 통계). 포인트는 항상 원장 SUM.
 */
import { classMissionFor } from './MissionService.js';
import { query } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import type { CsvCell } from '../lib/csvWrite.js';
import {
  monthKey as currentMonthKey,
  monthRange,
  previousWeekKey,
  weekKey as currentWeekKey,
} from '../lib/time.js';
import * as classRepo from '../repos/classRepo.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import type { ClassDashboardView, SchoolStatsView } from '../types/api.js';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

interface StudentWeekRow {
  id: number;
  name: string;
  student_no: number | null;
  points: number | null;
  submitted: number;
}

export async function classDashboard(classId: number): Promise<ClassDashboardView> {
  const classMission = await classMissionFor(classId);
  const klass = await classRepo.findClassById(classId);
  if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
  const wk = currentWeekKey();
  const students = await query<StudentWeekRow>(
    `SELECT u.id, u.name, u.student_no,
            (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id AND l.week_key = ?) AS points,
            EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.week_key = ? AND p.status <> 'draft' AND p.deleted_at IS NULL) AS submitted
     FROM users u WHERE u.class_id = ? AND u.role = 'student' AND u.status = 'active' ORDER BY u.student_no`,
    [wk, wk, classId],
  );
  const pending = await query<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM posts WHERE class_id = ? AND deleted_at IS NULL AND status IN ('pending','reviewed','flagged') GROUP BY status",
    [classId],
  );
  const cnt = (s: string) => Number(pending.find((p) => p.status === s)?.n ?? 0);
  const escalated = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM posts WHERE class_id = ? AND deleted_at IS NULL AND status = 'pending' AND (escalated_at IS NOT NULL OR submitted_at < DATE_SUB(NOW(3), INTERVAL 48 HOUR))",
    [classId],
  );
  const submitted = students.filter((s) => Number(s.submitted) === 1).length;
  const totalPoints = students.reduce((a, s) => a + Number(s.points ?? 0), 0);
  return {
    classId,
    className: klass.name,
    weekKey: wk,
    studentCount: students.length,
    submitted,
    submissionRate: pct(submitted, students.length),
    pending: {
      pending: cnt('pending'),
      reviewed: cnt('reviewed'),
      flagged: cnt('flagged'),
      escalated: Number(escalated[0]?.n ?? 0),
      total: cnt('pending') + cnt('reviewed') + cnt('flagged'),
    },
    avgWeekPoints: students.length ? Math.round((totalPoints / students.length) * 10) / 10 : 0,
    top5: [...students]
      .filter((s) => Number(s.points ?? 0) > 0)
      .sort(
        (a, b) =>
          Number(b.points ?? 0) - Number(a.points ?? 0) ||
          (a.student_no ?? 0) - (b.student_no ?? 0),
      )
      .slice(0, 5)
      .map((s) => ({
        userId: s.id,
        name: s.name,
        studentNo: s.student_no,
        points: Number(s.points ?? 0),
      })),
    nonParticipants: students
      .filter((s) => Number(s.submitted) === 0)
      .map((s) => ({ userId: s.id, name: s.name, studentNo: s.student_no })),
    classMission,
  };
}

/** TCH-05: 학생별 리포트 수·기사 수·댓글 수·받은 좋아요·누적 포인트·최근 8주 사용시간 */
export async function classStatsCsv(
  classId: number,
): Promise<{ filename: string; rows: CsvCell[][] }> {
  const klass = await classRepo.findClassById(classId);
  if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
  const weeks: string[] = [];
  let wk = currentWeekKey();
  for (let i = 0; i < 8; i += 1) {
    weeks.unshift(wk);
    wk = previousWeekKey(wk);
  }
  const rows = await query<{
    id: number;
    student_no: number | null;
    name: string;
    parent_consent: string;
    reports: number;
    articles: number;
    comments: number;
    likes_received: number | null;
    points: number | null;
    news_votes: number;
    news_comments: number;
  }>(
    `SELECT u.id, u.student_no, u.name, u.parent_consent,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.status = 'approved' AND p.deleted_at IS NULL) AS reports,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.type = 'article' AND p.status = 'approved' AND p.deleted_at IS NULL) AS articles,
       (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.status = 'visible') AS comments,
       (SELECT COUNT(*) FROM news_votes v WHERE v.user_id = u.id) AS news_votes,
       (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.status = 'visible' AND c.target_type = 'news_topic') AS news_comments,
       (SELECT SUM(p.like_count) FROM posts p WHERE p.author_id = u.id AND p.deleted_at IS NULL) AS likes_received,
       (SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id) AS points
     FROM users u WHERE u.class_id = ? AND u.role = 'student' AND u.status = 'active' ORDER BY u.student_no`,
    [classId],
  );
  const usage = await query<{ author_id: number; week_key: string; minutes: number | null }>(
    `SELECT p.author_id, p.week_key, rd.avg_minutes_per_day AS minutes FROM posts p JOIN report_details rd ON rd.post_id = p.id
     WHERE p.class_id = ? AND p.type = 'report' AND p.deleted_at IS NULL AND p.week_key IN (${weeks.map(() => '?').join(',')})`,
    [classId, ...weeks],
  );
  const usageMap = new Map(usage.map((u) => [`${u.author_id}:${u.week_key}`, u.minutes]));
  const header: CsvCell[] = [
    '번호',
    '이름',
    '동의',
    '승인 리포트 수',
    '승인 기사 수',
    '댓글 수',
    '받은 좋아요',
    '누적 포인트',
    '토론 투표 수',
    '토론 댓글 수',
    ...weeks.map((w) => `${w} 사용시간(분)`),
  ];
  const body: CsvCell[][] = rows.map((r) => [
    r.student_no,
    r.name,
    r.parent_consent,
    Number(r.reports),
    Number(r.articles),
    Number(r.comments),
    Number(r.likes_received ?? 0),
    Number(r.points ?? 0),
    Number(r.news_votes),
    Number(r.news_comments),
    ...weeks.map((w) => usageMap.get(`${r.id}:${w}`) ?? ''),
  ]);
  return { filename: `${klass.name}_통계_${currentWeekKey()}.csv`, rows: [header, ...body] };
}

/** ADM-05 전교 통계 */
export async function schoolStats(): Promise<SchoolStatsView> {
  const year = await currentSchoolYear();
  const wk = currentWeekKey();
  const mk = currentMonthKey();
  const empty: SchoolStatsView = {
    weekKey: wk,
    monthKey: mk,
    classes: [],
    grades: [],
    usageTrend: [],
    activityTrend: [],
  };
  if (!year) return empty;
  const { start, end } = monthRange(mk);
  const s = start.format('YYYY-MM-DD HH:mm:ss');
  const e = end.format('YYYY-MM-DD HH:mm:ss');
  const classes = await query<{
    class_id: number;
    class_name: string;
    grade: number;
    students: number;
    consent: number;
    week_submitted: number;
    month_participated: number;
    month_points: number | null;
    news_voters: number;
    news_commenters: number;
  }>(
    `SELECT c.id AS class_id, c.name AS class_name, c.grade,
       COUNT(u.id) AS students,
       SUM(u.parent_consent = 'Y') AS consent,
       SUM(EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.week_key = ? AND p.status <> 'draft' AND p.deleted_at IS NULL)) AS week_submitted,
       SUM(EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.status = 'approved' AND p.deleted_at IS NULL AND p.approved_at >= ? AND p.approved_at < ?)) AS month_participated,
       SUM((SELECT SUM(l.amount) FROM point_ledger l WHERE l.user_id = u.id AND l.month_key = ?)) AS month_points,
       SUM(EXISTS(SELECT 1 FROM news_votes v WHERE v.user_id = u.id AND v.created_at >= ? AND v.created_at < ?)) AS news_voters,
       SUM(EXISTS(SELECT 1 FROM comments cm WHERE cm.author_id = u.id AND cm.target_type = 'news_topic' AND cm.status = 'visible' AND cm.created_at >= ? AND cm.created_at < ?)) AS news_commenters
     FROM classes c LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.status = 'active'
     WHERE c.school_year_id = ? AND c.grade BETWEEN 3 AND 6 GROUP BY c.id ORDER BY c.grade, c.class_no`,
    [wk, s, e, mk, s, e, s, e, year.id],
  );
  const classViews = classes.map((c) => ({
    classId: c.class_id,
    className: c.class_name,
    grade: c.grade,
    students: Number(c.students),
    consentRate: pct(Number(c.consent ?? 0), Number(c.students)),
    weekSubmissionRate: pct(Number(c.week_submitted ?? 0), Number(c.students)),
    monthParticipationRate: pct(Number(c.month_participated ?? 0), Number(c.students)),
    avgMonthPoints: Number(c.students)
      ? Math.round((Number(c.month_points ?? 0) / Number(c.students)) * 10) / 10
      : 0,
    newsVoters: Number(c.news_voters ?? 0),
    newsCommenters: Number(c.news_commenters ?? 0),
  }));
  const grades = [3, 4, 5, 6].map((grade) => {
    const list = classes.filter((c) => c.grade === grade);
    const students = list.reduce((a, c) => a + Number(c.students), 0);
    return {
      grade,
      students,
      weekSubmissionRate: pct(
        list.reduce((a, c) => a + Number(c.week_submitted ?? 0), 0),
        students,
      ),
      monthParticipationRate: pct(
        list.reduce((a, c) => a + Number(c.month_participated ?? 0), 0),
        students,
      ),
    };
  });
  const weeks: string[] = [];
  let w = wk;
  for (let i = 0; i < 12; i += 1) {
    weeks.unshift(w);
    w = previousWeekKey(w);
  }
  const usage = await query<{ week_key: string; avg_minutes: number | null; reports: number }>(
    `SELECT p.week_key, AVG(rd.avg_minutes_per_day) AS avg_minutes, COUNT(*) AS reports
     FROM posts p JOIN report_details rd ON rd.post_id = p.id
     WHERE p.type = 'report' AND p.status = 'approved' AND p.deleted_at IS NULL AND p.week_key IN (${weeks.map(() => '?').join(',')})
     GROUP BY p.week_key`,
    weeks,
  );
  const activity = await query<{ yw: number; posts: number; comments: number; likes: number }>(
    `SELECT yw, SUM(posts) AS posts, SUM(comments) AS comments, SUM(likes) AS likes FROM (
       SELECT YEARWEEK(created_at, 3) AS yw, COUNT(*) AS posts, 0 AS comments, 0 AS likes FROM posts WHERE status <> 'draft' AND deleted_at IS NULL AND created_at >= ? GROUP BY yw
       UNION ALL SELECT YEARWEEK(created_at, 3), 0, COUNT(*), 0 FROM comments WHERE created_at >= ? GROUP BY YEARWEEK(created_at, 3)
       UNION ALL SELECT YEARWEEK(created_at, 3), 0, 0, COUNT(*) FROM likes WHERE created_at >= ? GROUP BY YEARWEEK(created_at, 3)
     ) t GROUP BY yw`,
    [
      weeks[0]?.slice(0, 4) + '-01-01',
      weeks[0]?.slice(0, 4) + '-01-01',
      weeks[0]?.slice(0, 4) + '-01-01',
    ],
  );
  const toKey = (yw: number) => `${String(yw).slice(0, 4)}-W${String(yw).slice(4)}`;
  const actMap = new Map(activity.map((a) => [toKey(Number(a.yw)), a]));
  return {
    weekKey: wk,
    monthKey: mk,
    classes: classViews,
    grades,
    usageTrend: weeks.map((k) => {
      const u = usage.find((x) => x.week_key === k);
      return {
        weekKey: k,
        avgMinutes: u && u.avg_minutes !== null ? Math.round(Number(u.avg_minutes)) : null,
        reports: Number(u?.reports ?? 0),
      };
    }),
    activityTrend: weeks.map((k) => {
      const a = actMap.get(k);
      return {
        weekKey: k,
        posts: Number(a?.posts ?? 0),
        comments: Number(a?.comments ?? 0),
        likes: Number(a?.likes ?? 0),
      };
    }),
  };
}
