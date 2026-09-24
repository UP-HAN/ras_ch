/**
 * 이번 주 미션(개인)·학급 미션 (게이미피케이션, PLAN 8장 "주간 목표 게이지", PRD 15장 학급 단위 미션)
 *  - 포인트 추가 지급 없음. 진행률·축하만
 *  - 학급 미션은 조회 시 라이브 계산, 달성 순간 class_mission_results 1행(UQ) + 반 학생 전원 알림 1회
 */
import { execute, query, queryOne } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { buildMissions, classMission } from '../lib/missions.js';
import { notify } from '../lib/notify.js';
import { weekKey, weekRange } from '../lib/time.js';
import { findClassById } from '../repos/classRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { ClassMissionView, MissionView } from '../types/api.js';
import { gamifySetting } from './GamifyService.js';

interface ActivityRow {
  report_submitted: number;
  comments_week: number | string;
  likes_week: number | string;
  debate_week: number | string;
  debate_available: number;
}

export async function personalMissions(user: AuthUser): Promise<MissionView[]> {
  if (user.row.role !== 'student') return [];
  const wk = weekKey();
  const { start, end } = weekRange(wk);
  const s = start.format('YYYY-MM-DD HH:mm:ss');
  const e = end.format('YYYY-MM-DD HH:mm:ss');
  const uid = user.row.id;
  const r = await queryOne<ActivityRow>(
    `SELECT
       EXISTS(SELECT 1 FROM posts p WHERE p.author_id = ? AND p.type IN ('report','diary') AND p.week_key = ? AND p.status <> 'draft' AND p.deleted_at IS NULL) AS report_submitted,
       (SELECT COUNT(*) FROM comments c WHERE c.author_id = ? AND c.status <> 'deleted' AND c.target_type <> 'news_topic' AND c.created_at >= ? AND c.created_at < ?) AS comments_week,
       (SELECT COUNT(*) FROM likes l WHERE l.user_id = ? AND l.created_at >= ? AND l.created_at < ?) AS likes_week,
       (SELECT COUNT(*) FROM news_votes v WHERE v.user_id = ? AND v.created_at >= ? AND v.created_at < ?)
         + (SELECT COUNT(*) FROM comments c WHERE c.author_id = ? AND c.target_type = 'news_topic' AND c.status <> 'deleted' AND c.created_at >= ? AND c.created_at < ?) AS debate_week,
       EXISTS(SELECT 1 FROM news_topics t WHERE t.status = 'live') AS debate_available`,
    [uid, wk, uid, s, e, uid, s, e, uid, s, e, uid, s, e],
  );
  return buildMissions({
    reportSubmitted: Number(r?.report_submitted ?? 0) === 1,
    commentsThisWeek: Number(r?.comments_week ?? 0),
    likesGivenThisWeek: Number(r?.likes_week ?? 0),
    debateActionsThisWeek: Number(r?.debate_week ?? 0),
    debateAvailable: Number(r?.debate_available ?? 0) === 1,
  });
}

export async function classMissionFor(classId: number): Promise<ClassMissionView> {
  const klass = await findClassById(classId);
  if (!klass) throw AppError.notFound('반을 찾을 수 없어요.');
  const wk = weekKey();
  const targetPct = (await gamifySetting()).classMissionReportRate;
  const r = await queryOne<{ students: number | string; submitted: number | string | null }>(
    `SELECT COUNT(*) AS students,
            SUM(EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.type IN ('report','diary') AND p.week_key = ? AND p.status <> 'draft' AND p.deleted_at IS NULL)) AS submitted
     FROM users u WHERE u.class_id = ? AND u.role = 'student' AND u.status = 'active'`,
    [wk, classId],
  );
  const state = classMission({
    students: Number(r?.students ?? 0),
    submitted: Number(r?.submitted ?? 0),
    targetPct,
  });
  let achievedAt: string | null = null;
  if (state.achieved) {
    const ins = await execute(
      'INSERT IGNORE INTO class_mission_results (class_id, week_key, target_pct, rate_pct) VALUES (?, ?, ?, ?)',
      [classId, wk, targetPct, state.ratePct],
    );
    if (ins.affectedRows > 0) {
      const ids = await query<{ id: number }>(
        "SELECT id FROM users WHERE class_id = ? AND role = 'student' AND status = 'active'",
        [classId],
      );
      for (const u of ids) {
        await notify(u.id, 'class_mission', {
          message: `🎉 우리 반 이번 주 미션 달성! 리포트 제출률 ${state.ratePct}%로 목표 ${targetPct}%를 넘었어요.`,
          link: '/',
          weekKey: wk,
        });
      }
    }
    const row = await queryOne<{ achieved_at: Date }>(
      'SELECT achieved_at FROM class_mission_results WHERE class_id = ? AND week_key = ?',
      [classId, wk],
    );
    achievedAt = row?.achieved_at ? row.achieved_at.toISOString() : null;
  }
  return { classId, className: klass.name, weekKey: wk, ...state, achievedAt };
}
