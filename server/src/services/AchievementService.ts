/**
 * 칭호·업적 (게이미피케이션, PLAN 8장): 정의·판정은 lib/achievements.ts, 여기서는 집계·저장·알림·대표 칭호
 *  - evaluate(userId) 는 승인·댓글·좋아요·투표·베스트·출석·결산·검토 뒤에 호출된다(evaluateSafe 로 본 흐름을 깨지 않음)
 *  - 한 번 얻은 칭호는 회수하지 않는다. 야간 recountCaches 에서 전원 재평가
 */
import type { Executor } from '../db/query.js';
import { execute, query, queryOne } from '../db/query.js';
import { getPool } from '../db/pool.js';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  isAchievementCode,
  titleOf,
  type AchievementStats,
} from '../lib/achievements.js';
import { AppError } from '../lib/apiResponse.js';
import { streakFrom } from '../lib/attendance.js';
import { logger } from '../lib/logger.js';
import { notify } from '../lib/notify.js';
import { dayKey } from '../lib/time.js';
import * as attendanceRepo from '../repos/attendanceRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { MyAchievementsView } from '../types/api.js';
import { tierProgress } from './TierService.js';

interface CountRow {
  comments_written: number | string;
  likes_received: number | string | null;
  debate_topics: number | string;
  best_opinions: number | string;
  approved_articles: number | string;
  hall_of_fame: number | string;
  read_count: number | string;
  reviews_done: number | string;
}

export async function loadStats(
  userId: number,
  conn: Executor = getPool(),
): Promise<AchievementStats> {
  const reports = await query<{ week_key: string | null; diff_minutes: number | null }>(
    `SELECT p.week_key, rd.diff_minutes
     FROM posts p LEFT JOIN report_details rd ON rd.post_id = p.id
     WHERE p.author_id = ? AND p.type IN ('report','diary') AND p.status = 'approved' AND p.deleted_at IS NULL
     ORDER BY p.week_key ASC, p.id ASC`,
    [userId],
    conn,
  );
  const c = await queryOne<CountRow>(
    `SELECT
       (SELECT COUNT(*) FROM comments c WHERE c.author_id = ? AND c.status = 'visible') AS comments_written,
       (SELECT COALESCE(SUM(p.like_count), 0) FROM posts p WHERE p.author_id = ? AND p.status = 'approved' AND p.deleted_at IS NULL)
         + (SELECT COALESCE(SUM(c.like_count), 0) FROM comments c WHERE c.author_id = ? AND c.status = 'visible') AS likes_received,
       (SELECT COUNT(*) FROM (
          SELECT v.topic_id AS tid FROM news_votes v WHERE v.user_id = ?
          UNION
          SELECT c.target_id AS tid FROM comments c WHERE c.author_id = ? AND c.target_type = 'news_topic' AND c.status <> 'deleted'
        ) x) AS debate_topics,
       (SELECT COUNT(*) FROM news_best_opinions b WHERE b.user_id = ?) AS best_opinions,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = ? AND p.type = 'article' AND p.status = 'approved' AND p.deleted_at IS NULL) AS approved_articles,
       (SELECT COUNT(*) FROM monthly_awards a WHERE a.user_id = ? AND a.status = 'selected')
         + (SELECT COUNT(*) FROM monthly_scores s JOIN monthly_settlements m ON m.id = s.settlement_id
            WHERE s.user_id = ? AND s.is_gift_target = 1 AND m.status = 'confirmed') AS hall_of_fame,
       (SELECT COUNT(*) FROM post_reads r WHERE r.user_id = ? AND r.completed_at IS NOT NULL) AS read_count,
       (SELECT COUNT(*) FROM review_logs l WHERE l.actor_id = ? AND l.action IN ('pass','hold')) AS reviews_done`,
    Array<number>(11).fill(userId),
    conn,
  );
  const days = await attendanceRepo.recentLoginDays(userId, 60);
  return {
    approvedReports: reports.length,
    reportWeekKeys: reports.map((r) => r.week_key).filter((k): k is string => !!k),
    reportDiffs: reports.map((r) => (r.diff_minutes === null ? null : Number(r.diff_minutes))),
    commentsWritten: Number(c?.comments_written ?? 0),
    likesReceived: Number(c?.likes_received ?? 0),
    debateTopics: Number(c?.debate_topics ?? 0),
    bestOpinions: Number(c?.best_opinions ?? 0),
    attendanceStreak: streakFrom(days, dayKey()),
    approvedArticles: Number(c?.approved_articles ?? 0),
    hallOfFame: Number(c?.hall_of_fame ?? 0),
    readCount: Number(c?.read_count ?? 0),
    reviewsDone: Number(c?.reviews_done ?? 0),
  };
}

async function earnedCodes(userId: number, conn: Executor): Promise<Map<string, Date>> {
  const rows = await query<{ code: string; earned_at: Date }>(
    'SELECT code, earned_at FROM user_achievements WHERE user_id = ?',
    [userId],
    conn,
  );
  return new Map(rows.map((r) => [r.code, r.earned_at]));
}

/** 새로 달성한 칭호를 기록하고 알린다. 반환: 새로 얻은 코드 */
export async function evaluate(userId: number, conn: Executor = getPool()): Promise<string[]> {
  const stats = await loadStats(userId, conn);
  const earned = evaluateAchievements(stats);
  if (earned.length === 0) return [];
  const have = await earnedCodes(userId, conn);
  const fresh = earned.filter((code) => !have.has(code));
  const added: string[] = [];
  for (const code of fresh) {
    const r = await execute(
      'INSERT IGNORE INTO user_achievements (user_id, code) VALUES (?, ?)',
      [userId, code],
      conn,
    );
    if (r.affectedRows === 0) continue;
    const t = titleOf(code);
    if (t) {
      await notify(
        userId,
        'achievement',
        {
          message: `${t.emoji} 새 칭호 "${t.label}"을(를) 얻었어요! 내 정보에서 대표 칭호로 걸 수 있어요.`,
          link: '/me',
          code,
        },
        conn,
      );
    }
    added.push(code);
  }
  return added;
}

/** 본 흐름(승인·댓글 등)을 깨지 않도록 실패는 로그만 남긴다 */
export async function evaluateSafe(userId: number, conn?: Executor): Promise<string[]> {
  try {
    return await evaluate(userId, conn);
  } catch (err) {
    logger.warn({ err, userId }, '업적 판정 실패');
    return [];
  }
}

export async function evaluateAll(): Promise<number> {
  const rows = await query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'student' AND status = 'active'",
  );
  let added = 0;
  for (const r of rows) added += (await evaluateSafe(r.id)).length;
  return added;
}

export async function myAchievements(user: AuthUser): Promise<MyAchievementsView> {
  const uid = user.row.id;
  await evaluateSafe(uid);
  const stats = await loadStats(uid);
  const have = await earnedCodes(uid, getPool());
  const titleCode = have.has(user.row.title_code ?? '') ? user.row.title_code : null;
  return {
    tier: await tierProgress(uid),
    titleCode,
    attendanceStreak: stats.attendanceStreak,
    achievements: ACHIEVEMENTS.map((a) => ({
      code: a.code,
      emoji: a.emoji,
      label: a.label,
      hint: a.hint,
      earned: have.has(a.code),
      earnedAt: have.get(a.code)?.toISOString() ?? null,
      progress: a.progress(stats),
      isTitle: titleCode === a.code,
    })),
  };
}

/** 대표 칭호 설정 — 획득한 칭호만 (null 이면 해제) */
export async function setTitle(
  user: AuthUser,
  code: string | null,
): Promise<{ titleCode: string | null }> {
  if (code !== null) {
    if (!isAchievementCode(code)) throw AppError.badRequest('없는 칭호예요.');
    const have = await earnedCodes(user.row.id, getPool());
    if (!have.has(code))
      throw AppError.badRequest('아직 얻지 못한 칭호예요. 조건을 채우면 걸 수 있어요.');
  }
  await execute('UPDATE users SET title_code = ? WHERE id = ?', [code, user.row.id]);
  return { titleCode: code };
}
