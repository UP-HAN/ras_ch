/**
 * 실천 변화 리포트 (관리자): 시작 주차 ~ 이번 주까지 폰프리 실천이 나아지고 있는지 여러 지표로.
 * 모든 수치에 표본(누구 기준·몇 명/전체)을 붙인다 — lib/insights.ts
 */
import { query } from '../db/query.js';
import {
  bucketMinutes,
  mean,
  median,
  pairedChange,
  pct,
  sample,
  shares,
  splitPeriods,
  weeksBetween,
  type Sample,
} from '../lib/insights.js';
import { weekKey as currentWeekKey, weekRange } from '../lib/time.js';
import { currentSchoolYear } from '../repos/schoolYearRepo.js';
import type { InsightsView, WeekPoint } from '../types/api.js';

interface StudentRow {
  id: number;
  class_id: number;
  class_name: string;
  parent_consent: 'Y' | 'N';
  tier: string;
}
interface ReportRow {
  author_id: number;
  class_id: number;
  week_key: string;
  type: 'report' | 'diary';
  status: string;
  avg: number | null;
  diff: number | null;
  goal_achieved: 0 | 1 | null;
  top_category: string | null;
  top_app: string | null;
  goal_text: string | null;
}
interface ActRow {
  user_id: number;
  yw: number;
  kind: 'comment' | 'like' | 'read' | 'vote';
  n: number;
}

const ywToKey = (yw: number) => `${String(yw).slice(0, 4)}-W${String(yw).slice(4)}`;

export async function buildInsights(): Promise<InsightsView> {
  const year = await currentSchoolYear();
  const CUR = currentWeekKey();
  const empty: InsightsView = {
    period: { fromWeek: CUR, toWeek: CUR, weeks: [] },
    summary: {
      students: 0,
      consentRate: 0,
      reportedOnce: sample(0, 0, 'all'),
      capturedOnce: sample(0, 0, 'all'),
      thisWeekSubmission: sample(0, 0, 'all'),
      approvedReports: 0,
    },
    participation: { submissionRate: [], captureShare: [], activeRate: [] },
    usage: {
      avgMinutes: [],
      medianMinutes: [],
      decreaseRate: [],
      paired: {
        firstAvg: null,
        recentAvg: null,
        deltaMinutes: null,
        deltaPct: null,
        decreasedPct: null,
        increasedPct: null,
        samePct: null,
        sample: sample(0, 0, 'paired'),
        firstWeeks: [],
        recentWeeks: [],
      },
      buckets: {
        first: [],
        recent: [],
        firstSample: sample(0, 0, 'submitted'),
        recentSample: sample(0, 0, 'submitted'),
      },
    },
    goals: {
      achievedRate: [],
      topGoals: [],
      categories: { first: [], recent: [] },
      apps: { first: [], recent: [] },
    },
    community: {
      weekly: [],
      debateVoteRate: sample(0, 0, 'all'),
      debateOpinionRate: sample(0, 0, 'all'),
      councilVoteRate: sample(0, 0, 'all'),
    },
    classes: [],
    tiers: [],
    achievementsRate: sample(0, 0, 'all'),
  };
  if (!year) return empty;

  const students = await query<StudentRow>(
    `SELECT u.id, u.class_id, c.name AS class_name, u.parent_consent, u.tier
     FROM users u JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.status = 'active' AND c.school_year_id = ?
     ORDER BY c.grade, c.class_no, u.student_no`,
    [year.id],
  );
  const M = students.length;
  if (M === 0) return empty;
  const studentIds = new Set(students.map((s) => s.id));

  const reports = (
    await query<ReportRow>(
      `SELECT p.author_id, p.class_id, p.week_key, p.type, p.status, rd.avg_minutes_per_day AS avg, rd.diff_minutes AS diff,
              rd.goal_achieved, rd.top_category, rd.top_app, p.goal_text
       FROM posts p LEFT JOIN report_details rd ON rd.post_id = p.id
       WHERE p.type IN ('report','diary') AND p.status <> 'draft' AND p.deleted_at IS NULL AND p.week_key IS NOT NULL`,
    )
  ).filter((r) => studentIds.has(r.author_id));
  const fromWeek = reports.length ? ([...reports].map((r) => r.week_key).sort()[0] as string) : CUR;
  const weeks = weeksBetween(fromWeek, CUR);
  const periodStart = weekRange(fromWeek).start.format('YYYY-MM-DD HH:mm:ss');

  // 활동(댓글·엄지척·읽기·토론 투표) — 학생·주차별
  const acts = (
    await query<ActRow>(
      `SELECT user_id, yw, kind, COUNT(*) AS n FROM (
         SELECT author_id AS user_id, YEARWEEK(created_at, 3) AS yw, 'comment' AS kind FROM comments WHERE status <> 'deleted' AND created_at >= ?
         UNION ALL SELECT user_id, YEARWEEK(created_at, 3), 'like' FROM likes WHERE created_at >= ?
         UNION ALL SELECT user_id, YEARWEEK(completed_at, 3), 'read' FROM post_reads WHERE completed_at IS NOT NULL AND completed_at >= ?
         UNION ALL SELECT user_id, YEARWEEK(created_at, 3), 'vote' FROM news_votes WHERE created_at >= ?
       ) t GROUP BY user_id, yw, kind`,
      [periodStart, periodStart, periodStart, periodStart],
    )
  ).filter((a) => studentIds.has(a.user_id));

  // ---------- 주차별 ----------
  const approvedCapture = (r: ReportRow) =>
    r.status === 'approved' && r.type === 'report' && r.avg !== null;
  const byWeek = new Map<string, ReportRow[]>();
  for (const r of reports) byWeek.set(r.week_key, [...(byWeek.get(r.week_key) ?? []), r]);
  const actByWeek = new Map<string, ActRow[]>();
  for (const a of acts) {
    const k = ywToKey(Number(a.yw));
    actByWeek.set(k, [...(actByWeek.get(k) ?? []), a]);
  }
  const submissionRate: WeekPoint[] = [];
  const captureShare: WeekPoint[] = [];
  const activeRate: WeekPoint[] = [];
  const avgMinutes: WeekPoint[] = [];
  const medianMinutes: WeekPoint[] = [];
  const decreaseRate: WeekPoint[] = [];
  const achievedRate: WeekPoint[] = [];
  const weekly: InsightsView['community']['weekly'] = [];
  for (const wk of weeks) {
    const rows = byWeek.get(wk) ?? [];
    const submitters = new Set(rows.map((r) => r.author_id));
    submissionRate.push({
      weekKey: wk,
      value: pct(submitters.size, M),
      sample: sample(submitters.size, M, 'all'),
    });
    const captures = rows.filter((r) => r.type === 'report');
    captureShare.push({
      weekKey: wk,
      value: rows.length ? pct(captures.length, rows.length) : null,
      sample: sample(captures.length, rows.length, 'submitted'),
    });
    const a = actByWeek.get(wk) ?? [];
    const activeIds = new Set([...a.map((x) => x.user_id), ...submitters]);
    activeRate.push({
      weekKey: wk,
      value: pct(activeIds.size, M),
      sample: sample(activeIds.size, M, 'all'),
    });
    const mins = rows.filter(approvedCapture).map((r) => Number(r.avg));
    avgMinutes.push({
      weekKey: wk,
      value: mean(mins),
      sample: sample(mins.length, M, 'submitted'),
    });
    medianMinutes.push({
      weekKey: wk,
      value: median(mins),
      sample: sample(mins.length, M, 'submitted'),
    });
    const withDiff = rows.filter((r) => r.status === 'approved' && r.diff !== null);
    decreaseRate.push({
      weekKey: wk,
      value: withDiff.length
        ? pct(withDiff.filter((r) => Number(r.diff) < 0).length, withDiff.length)
        : null,
      sample: sample(withDiff.length, M, 'submitted'),
    });
    const withGoal = rows.filter((r) => r.status === 'approved' && r.goal_achieved !== null);
    achievedRate.push({
      weekKey: wk,
      value: withGoal.length
        ? pct(withGoal.filter((r) => r.goal_achieved === 1).length, withGoal.length)
        : null,
      sample: sample(withGoal.length, M, 'submitted'),
    });
    const sum = (kind: ActRow['kind']) =>
      a.filter((x) => x.kind === kind).reduce((s, x) => s + Number(x.n), 0);
    const commenters = new Set(a.filter((x) => x.kind === 'comment').map((x) => x.user_id));
    weekly.push({
      weekKey: wk,
      comments: sum('comment'),
      likes: sum('like'),
      reads: sum('read'),
      commenters: sample(commenters.size, M, 'all'),
    });
  }

  // ---------- 같은 학생 비교 ----------
  const { first, recent } = splitPeriods(weeks);
  const avgIn = (ids: Iterable<number>, ws: string[]) => {
    const out = new Map<number, number>();
    for (const id of ids) {
      const vals = reports
        .filter((r) => r.author_id === id && ws.includes(r.week_key) && approvedCapture(r))
        .map((r) => Number(r.avg));
      const m = mean(vals);
      if (m !== null) out.set(id, m);
    }
    return out;
  };
  const allIds = students.map((s) => s.id);
  const firstMap = avgIn(allIds, first);
  const recentMap = avgIn(allIds, recent);
  const pairs = allIds
    .filter((id) => firstMap.has(id) && recentMap.has(id))
    .map((id) => ({ first: firstMap.get(id) as number, recent: recentMap.get(id) as number }));
  const pc = pairedChange(pairs);
  const firstVals = [...firstMap.values()];
  const recentVals = [...recentMap.values()];

  // ---------- 목표·카테고리 ----------
  const approvedRows = reports.filter((r) => r.status === 'approved');
  const inWeeks = (ws: string[]) => approvedRows.filter((r) => ws.includes(r.week_key));
  const topGoals = shares(
    approvedRows.map((r) => r.goal_text),
    5,
  ).map((s) => ({ text: s.key, count: s.count }));

  // ---------- 함께하는 문화 (기간 전체, 학생 기준) ----------
  const voters = new Set(acts.filter((a) => a.kind === 'vote').map((a) => a.user_id));
  const opinionAuthors = (
    await query<{ author_id: number }>(
      "SELECT DISTINCT author_id FROM comments WHERE target_type = 'news_topic' AND status <> 'deleted' AND created_at >= ?",
      [periodStart],
    )
  ).filter((r) => studentIds.has(r.author_id));
  const councilVoters = (
    await query<{ user_id: number }>('SELECT DISTINCT user_id FROM council_poll_votes')
  ).filter((r) => studentIds.has(r.user_id));

  // ---------- 학급별 ----------
  const classes: InsightsView['classes'] = [];
  const byClass = new Map<number, StudentRow[]>();
  for (const s of students) byClass.set(s.class_id, [...(byClass.get(s.class_id) ?? []), s]);
  const recentWeeksForActive = weeks.slice(-2);
  for (const [classId, list] of byClass) {
    const ids = list.map((s) => s.id);
    const idSet = new Set(ids);
    const reportedOnce = ids.filter((id) => reports.some((r) => r.author_id === id)).length;
    const weeklyRates = weeks.map((wk) =>
      pct(
        new Set(
          (byWeek.get(wk) ?? []).filter((r) => idSet.has(r.author_id)).map((r) => r.author_id),
        ).size,
        ids.length,
      ),
    );
    const cf = avgIn(ids, first);
    const cr = avgIn(ids, recent);
    const cp = pairedChange(
      ids
        .filter((id) => cf.has(id) && cr.has(id))
        .map((id) => ({ first: cf.get(id) as number, recent: cr.get(id) as number })),
    );
    const activeIds = new Set<number>();
    for (const wk of recentWeeksForActive) {
      for (const a of actByWeek.get(wk) ?? []) if (idSet.has(a.user_id)) activeIds.add(a.user_id);
      for (const r of byWeek.get(wk) ?? []) if (idSet.has(r.author_id)) activeIds.add(r.author_id);
    }
    classes.push({
      classId,
      className: list[0]?.class_name ?? String(classId),
      students: ids.length,
      reportedOncePct: pct(reportedOnce, ids.length),
      avgSubmissionPct: mean(weeklyRates) ?? 0,
      pairedDelta: cp.deltaMinutes,
      decreasedPct: cp.decreasedPct,
      pairedSample: sample(cp.n, ids.length, 'paired'),
      activePct: pct(activeIds.size, ids.length),
    });
  }

  // ---------- 등급·칭호 ----------
  const tierCounts = new Map<string, number>();
  for (const s of students) tierCounts.set(s.tier, (tierCounts.get(s.tier) ?? 0) + 1);
  const achieved = (
    await query<{ user_id: number }>('SELECT DISTINCT user_id FROM user_achievements')
  ).filter((r) => studentIds.has(r.user_id));

  const thisWeekSubmitters = new Set((byWeek.get(CUR) ?? []).map((r) => r.author_id));
  return {
    period: { fromWeek, toWeek: CUR, weeks },
    summary: {
      students: M,
      consentRate: pct(students.filter((s) => s.parent_consent === 'Y').length, M),
      reportedOnce: sample(new Set(reports.map((r) => r.author_id)).size, M, 'all'),
      capturedOnce: sample(
        new Set(reports.filter(approvedCapture).map((r) => r.author_id)).size,
        M,
        'all',
      ),
      thisWeekSubmission: sample(thisWeekSubmitters.size, M, 'all'),
      approvedReports: approvedRows.length,
    },
    participation: { submissionRate, captureShare, activeRate },
    usage: {
      avgMinutes,
      medianMinutes,
      decreaseRate,
      paired: { ...pc, sample: sample(pc.n, M, 'paired'), firstWeeks: first, recentWeeks: recent },
      buckets: {
        first: bucketMinutes(firstVals),
        recent: bucketMinutes(recentVals),
        firstSample: sample(firstVals.length, M, 'submitted'),
        recentSample: sample(recentVals.length, M, 'submitted'),
      },
    },
    goals: {
      achievedRate,
      topGoals,
      categories: {
        first: shares(inWeeks(first).map((r) => r.top_category)),
        recent: shares(inWeeks(recent).map((r) => r.top_category)),
      },
      apps: {
        first: shares(inWeeks(first).map((r) => r.top_app)),
        recent: shares(inWeeks(recent).map((r) => r.top_app)),
      },
    },
    community: {
      weekly,
      debateVoteRate: sample(voters.size, M, 'all'),
      debateOpinionRate: sample(opinionAuthors.length, M, 'all'),
      councilVoteRate: sample(councilVoters.length, M, 'all'),
    },
    classes,
    tiers: ['seed', 'sprout', 'flower', 'fruit', 'star'].map((tier) => ({
      tier,
      count: tierCounts.get(tier) ?? 0,
    })),
    achievementsRate: sample(achieved.length, M, 'all'),
  };
}

export type { Sample };
