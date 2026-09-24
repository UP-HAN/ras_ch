/**
 * 내 정보·홈 (9.1 GET /me, 6.1 홈, CMN-03 알림, CMN-05)
 *  - 이번 주 포인트는 원장 SUM (절대 규칙 1)
 *  - 리포트 상태는 S2에서 실데이터가 생기며, 지금은 posts 조회만 (없으면 'none')
 */
import { execute, query, queryOne } from '../db/query.js';
import { toMeView } from '../lib/serializers/user.js';
import { weekKey } from '../lib/time.js';
import type { AuthUser } from '../types/auth.js';
import type { HomeView, MeView, NotificationView } from '../types/api.js';
import type { PostStatus } from '../types/db.js';
import { activeNotices } from './NoticeService.js';
import { latestLive } from './NewsService.js';

export function meView(user: AuthUser, actingAs: MeView['actingAs']): MeView {
  return toMeView({ user: user.row, klass: user.klass, isCouncil: user.isCouncil }, actingAs);
}

interface NotificationRow {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

function toNotificationView(n: NotificationRow): NotificationView {
  return {
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.read_at ? n.read_at.toISOString() : null,
    createdAt: n.created_at.toISOString(),
  };
}

export async function listNotifications(userId: number, limit = 20): Promise<NotificationView[]> {
  const rows = await query<NotificationRow>(
    'SELECT id, type, payload, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map(toNotificationView);
}

export async function markNotificationRead(userId: number, id: number): Promise<boolean> {
  const r = await execute(
    'UPDATE notifications SET read_at = NOW(3) WHERE id = ? AND user_id = ? AND read_at IS NULL',
    [id, userId],
  );
  return r.affectedRows > 0;
}

export async function getHome(user: AuthUser, actingAs: MeView['actingAs']): Promise<HomeView> {
  const wk = weekKey();
  const points = await queryOne<{ total: number | null }>(
    'SELECT SUM(amount) AS total FROM point_ledger WHERE user_id = ? AND week_key = ?',
    [user.row.id, wk],
  );
  const report = await queryOne<{ id: number; status: PostStatus }>(
    `SELECT id, status FROM posts WHERE author_id = ? AND type IN ('report','diary') AND week_key = ? AND deleted_at IS NULL LIMIT 1`,
    [user.row.id, wk],
  );
  return {
    me: meView(user, actingAs),
    weekKey: wk,
    weekPoints: Number(points?.total ?? 0),
    report: report
      ? { status: report.status, postId: report.id }
      : { status: 'none', postId: null },
    notifications: await listNotifications(user.row.id, 5),
    notices: await activeNotices(),
    debate: await latestLive(user),
  };
}
