/**
 * 학생자치회 게시판 저장소 (CNC-01~08): council_posts / council_post_images / council_poll_options / council_poll_votes / council_members
 */
import type { PoolConnection } from 'mysql2/promise';
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { CouncilPostStatus, CouncilPostType } from '../types/api.js';

export interface CouncilPostRow {
  id: number;
  author_id: number;
  type: CouncilPostType;
  title: string;
  body: string;
  status: CouncilPostStatus;
  starts_at: Date;
  ends_at: Date;
  pin_requested: 0 | 1;
  is_pinned: 0 | 1;
  allow_comments: 0 | 1;
  poll_show_before_close: 0 | 1;
  approved_by: number | null;
  approved_at: Date | null;
  reject_reason: string | null;
  submitted_at: Date | null;
  like_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CouncilPostImageRow {
  id: number;
  post_id: number;
  path: string;
  width: number;
  height: number;
  sort: number;
}

export interface CouncilPollOptionRow {
  id: number;
  post_id: number;
  label: string;
  sort: number;
  vote_count: number;
}

export interface CouncilAuthor {
  id: number;
  name: string;
  display_name: string;
  class_name: string;
  grade: number;
  council_title: string | null;
}

export interface CouncilPostBundle {
  post: CouncilPostRow;
  author: CouncilAuthor;
  images: CouncilPostImageRow[];
  options: CouncilPollOptionRow[];
  approvedByName: string | null;
}

type BundleRow = CouncilPostRow & {
  a_name: string;
  a_display_name: string;
  a_class_name: string;
  a_grade: number;
  a_council_title: string | null;
  approved_by_name: string | null;
};

const SELECT = `
  SELECT cp.*, u.name AS a_name, u.display_name AS a_display_name, c.name AS a_class_name, c.grade AS a_grade,
         (SELECT cm.title FROM council_members cm WHERE cm.user_id = u.id ORDER BY cm.is_active DESC, cm.id DESC LIMIT 1) AS a_council_title,
         ab.name AS approved_by_name
  FROM council_posts cp JOIN users u ON u.id = cp.author_id JOIN classes c ON c.id = u.class_id
       LEFT JOIN users ab ON ab.id = cp.approved_by`;

async function attach(rows: BundleRow[], conn: Executor): Promise<CouncilPostBundle[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const images = await query<CouncilPostImageRow>(
    `SELECT * FROM council_post_images WHERE post_id IN (${ph}) ORDER BY sort, id`,
    ids,
    conn,
  );
  const options = await query<CouncilPollOptionRow>(
    `SELECT * FROM council_poll_options WHERE post_id IN (${ph}) ORDER BY sort, id`,
    ids,
    conn,
  );
  return rows.map((r) => {
    const {
      a_name,
      a_display_name,
      a_class_name,
      a_grade,
      a_council_title,
      approved_by_name,
      ...post
    } = r;
    return {
      post: post as CouncilPostRow,
      author: {
        id: post.author_id,
        name: a_name,
        display_name: a_display_name,
        class_name: a_class_name,
        grade: a_grade,
        council_title: a_council_title,
      },
      images: images.filter((i) => i.post_id === r.id),
      options: options.filter((o) => o.post_id === r.id),
      approvedByName: approved_by_name,
    };
  });
}

export async function findPost(
  id: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<CouncilPostRow | null> {
  return queryOne<CouncilPostRow>(
    `SELECT * FROM council_posts WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
    conn,
  );
}

export async function loadBundle(
  id: number,
  conn: Executor = getPool(),
): Promise<CouncilPostBundle | null> {
  const rows = await query<BundleRow>(`${SELECT} WHERE cp.id = ?`, [id], conn);
  return (await attach(rows, conn))[0] ?? null;
}

/** 게시 중: approved + 기간 내. 고정 먼저, 최근 승인순 */
export async function listLive(limit = 50): Promise<CouncilPostBundle[]> {
  const rows = await query<BundleRow>(
    `${SELECT} WHERE cp.status = 'approved' AND cp.starts_at <= NOW(3) AND cp.ends_at > NOW(3)
     ORDER BY cp.is_pinned DESC, cp.approved_at DESC, cp.id DESC LIMIT ?`,
    [limit],
  );
  return attach(rows, getPool());
}

/** 지난 글: 만료됐거나 기간이 끝난 승인 글 */
export async function listPast(limit = 50): Promise<CouncilPostBundle[]> {
  const rows = await query<BundleRow>(
    `${SELECT} WHERE (cp.status = 'expired' OR (cp.status = 'approved' AND cp.ends_at <= NOW(3)))
     ORDER BY cp.ends_at DESC, cp.id DESC LIMIT ?`,
    [limit],
  );
  return attach(rows, getPool());
}

/** 임원용: 승인 전(초안·대기·반려) 글 전부 (공동 편집, CNC-05) */
export async function listDrafts(limit = 50): Promise<CouncilPostBundle[]> {
  const rows = await query<BundleRow>(
    `${SELECT} WHERE cp.status IN ('draft','pending','rejected') ORDER BY cp.updated_at DESC LIMIT ?`,
    [limit],
  );
  return attach(rows, getPool());
}

/** 홈 고정 배너: 게시 중 + 고정, 최근 승인순 최대 N */
export async function listPinned(limit = 3): Promise<CouncilPostBundle[]> {
  const rows = await query<BundleRow>(
    `${SELECT} WHERE cp.status = 'approved' AND cp.is_pinned = 1 AND cp.starts_at <= NOW(3) AND cp.ends_at > NOW(3)
     ORDER BY cp.approved_at DESC, cp.id DESC LIMIT ?`,
    [limit],
  );
  return attach(rows, getPool());
}

export async function listByStatuses(
  statuses: CouncilPostStatus[],
  limit = 100,
): Promise<CouncilPostBundle[]> {
  if (statuses.length === 0) return [];
  const rows = await query<BundleRow>(
    `${SELECT} WHERE cp.status IN (${statuses.map(() => '?').join(',')})
     ORDER BY FIELD(cp.status,'pending','approved','draft','rejected','hidden','expired'), cp.updated_at DESC LIMIT ?`,
    [...statuses, limit],
  );
  return attach(rows, getPool());
}

export interface NewCouncilPost {
  authorId: number;
  type: CouncilPostType;
  title: string;
  body: string;
  status: 'draft' | 'pending';
  startsAt: string;
  endsAt: string;
  pinRequested: boolean;
  allowComments: boolean;
  pollShowBeforeClose: boolean;
}

export async function insertPost(p: NewCouncilPost, conn: PoolConnection): Promise<number> {
  return insert(
    `INSERT INTO council_posts (author_id, type, title, body, status, starts_at, ends_at, pin_requested, allow_comments, poll_show_before_close, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${p.status === 'pending' ? 'NOW(3)' : 'NULL'})`,
    [
      p.authorId,
      p.type,
      p.title,
      p.body,
      p.status,
      p.startsAt,
      p.endsAt,
      p.pinRequested ? 1 : 0,
      p.allowComments ? 1 : 0,
      p.pollShowBeforeClose ? 1 : 0,
    ],
    conn,
  );
}

export interface CouncilPostPatch {
  type?: CouncilPostType;
  title?: string;
  body?: string;
  status?: CouncilPostStatus;
  startsAt?: string;
  endsAt?: string;
  pinRequested?: boolean;
  isPinned?: boolean;
  allowComments?: boolean;
  pollShowBeforeClose?: boolean;
  approvedBy?: number | null;
  approvedNow?: boolean;
  rejectReason?: string | null;
  submittedNow?: boolean;
}

const COLS: Record<string, string> = {
  type: 'type',
  title: 'title',
  body: 'body',
  status: 'status',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  rejectReason: 'reject_reason',
  approvedBy: 'approved_by',
};
const BOOL_COLS: Record<string, string> = {
  pinRequested: 'pin_requested',
  isPinned: 'is_pinned',
  allowComments: 'allow_comments',
  pollShowBeforeClose: 'poll_show_before_close',
};

export async function updatePost(
  id: number,
  patch: CouncilPostPatch,
  conn: Executor = getPool(),
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k in COLS) {
      sets.push(`${COLS[k]} = ?`);
      params.push(v);
    } else if (k in BOOL_COLS) {
      sets.push(`${BOOL_COLS[k]} = ?`);
      params.push(v ? 1 : 0);
    } else if (k === 'approvedNow' && v) sets.push('approved_at = NOW(3)');
    else if (k === 'submittedNow' && v) sets.push('submitted_at = NOW(3)');
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE council_posts SET ${sets.join(', ')} WHERE id = ?`, params, conn);
}

export async function replaceImages(
  postId: number,
  images: Array<{ path: string; width: number; height: number }>,
  conn: PoolConnection,
): Promise<string[]> {
  const old = await query<{ path: string }>(
    'SELECT path FROM council_post_images WHERE post_id = ?',
    [postId],
    conn,
  );
  await execute('DELETE FROM council_post_images WHERE post_id = ?', [postId], conn);
  let sort = 0;
  for (const img of images) {
    await execute(
      'INSERT INTO council_post_images (post_id, path, width, height, sort) VALUES (?, ?, ?, ?, ?)',
      [postId, img.path, img.width, img.height, sort],
      conn,
    );
    sort += 1;
  }
  return old.map((o) => o.path);
}

/** 선택지 교체 — 투표가 이미 있으면 호출부에서 막는다 */
export async function replaceOptions(
  postId: number,
  labels: string[],
  conn: PoolConnection,
): Promise<void> {
  await execute('DELETE FROM council_poll_options WHERE post_id = ?', [postId], conn);
  let sort = 0;
  for (const label of labels) {
    await execute(
      'INSERT INTO council_poll_options (post_id, label, sort) VALUES (?, ?, ?)',
      [postId, label, sort],
      conn,
    );
    sort += 1;
  }
}

export async function countVotes(postId: number, conn: Executor = getPool()): Promise<number> {
  const r = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM council_poll_votes WHERE post_id = ?',
    [postId],
    conn,
  );
  return Number(r?.n ?? 0);
}

export async function findVote(
  postId: number,
  userId: number,
  conn: Executor = getPool(),
): Promise<{ id: number; option_id: number } | null> {
  return queryOne<{ id: number; option_id: number }>(
    'SELECT id, option_id FROM council_poll_votes WHERE post_id = ? AND user_id = ?',
    [postId, userId],
    conn,
  );
}

export async function insertVote(
  postId: number,
  optionId: number,
  userId: number,
  conn: PoolConnection,
): Promise<void> {
  await insert(
    'INSERT INTO council_poll_votes (post_id, option_id, user_id) VALUES (?, ?, ?)',
    [postId, optionId, userId],
    conn,
  );
  await execute(
    'UPDATE council_poll_options SET vote_count = vote_count + 1 WHERE id = ?',
    [optionId],
    conn,
  );
}

export async function myVotes(userId: number, postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await query<{ post_id: number; option_id: number }>(
    `SELECT post_id, option_id FROM council_poll_votes WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
    [userId, ...postIds],
  );
  return new Map(rows.map((r) => [r.post_id, r.option_id]));
}

export async function bumpLikes(
  id: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<number> {
  await execute(
    'UPDATE council_posts SET like_count = GREATEST(0, like_count + ?) WHERE id = ?',
    [delta, id],
    conn,
  );
  const r = await queryOne<{ like_count: number }>(
    'SELECT like_count FROM council_posts WHERE id = ?',
    [id],
    conn,
  );
  return r?.like_count ?? 0;
}

export async function bumpComments(
  id: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE council_posts SET comment_count = GREATEST(0, comment_count + ?) WHERE id = ?',
    [delta, id],
    conn,
  );
}

export async function findImageByPath(
  path: string,
): Promise<(CouncilPostImageRow & { post: CouncilPostRow }) | null> {
  const img = await queryOne<CouncilPostImageRow>(
    'SELECT * FROM council_post_images WHERE path = ? LIMIT 1',
    [path],
  );
  if (!img) return null;
  const post = await findPost(img.post_id);
  return post ? { ...img, post } : null;
}

/** 게시 기간이 끝난 승인 글 → expired, 고정 해제 (배치 councilExpire) */
export async function expireEnded(): Promise<number> {
  const r = await execute(
    "UPDATE council_posts SET status = 'expired', is_pinned = 0 WHERE status = 'approved' AND ends_at <= NOW(3)",
  );
  return r.affectedRows;
}

// ---------- 임원 (council_members) ----------

export interface CouncilMemberRowFull {
  id: number;
  user_id: number;
  title: string;
  term_start: string;
  term_end: string | null;
  is_active: 0 | 1;
  name: string;
  display_name: string;
  class_name: string;
  grade: number;
  student_no: number | null;
}

export async function listMembers(): Promise<CouncilMemberRowFull[]> {
  return query<CouncilMemberRowFull>(
    `SELECT cm.id, cm.user_id, cm.title, DATE_FORMAT(cm.term_start, '%Y-%m-%d') AS term_start,
            DATE_FORMAT(cm.term_end, '%Y-%m-%d') AS term_end, cm.is_active,
            u.name, u.display_name, c.name AS class_name, c.grade, u.student_no
     FROM council_members cm JOIN users u ON u.id = cm.user_id LEFT JOIN classes c ON c.id = u.class_id
     ORDER BY cm.is_active DESC, c.grade DESC, c.class_no, u.student_no`,
  );
}

export async function findActiveMembership(userId: number): Promise<{ id: number } | null> {
  return queryOne<{ id: number }>(
    `SELECT id FROM council_members WHERE user_id = ? AND is_active = 1 AND term_start <= CURDATE() AND (term_end IS NULL OR term_end >= CURDATE())`,
    [userId],
  );
}

export async function insertMember(m: {
  userId: number;
  title: string;
  termStart: string;
  termEnd: string | null;
}): Promise<number> {
  return insert(
    'INSERT INTO council_members (user_id, title, term_start, term_end, is_active) VALUES (?, ?, ?, ?, 1)',
    [m.userId, m.title, m.termStart, m.termEnd],
  );
}

export async function deactivateMember(id: number): Promise<boolean> {
  const r = await execute(
    'UPDATE council_members SET is_active = 0, term_end = LEAST(COALESCE(term_end, CURDATE()), CURDATE()) WHERE id = ? AND is_active = 1',
    [id],
  );
  return r.affectedRows > 0;
}

export async function findMember(id: number): Promise<CouncilMemberRowFull | null> {
  const rows = await listMembers();
  return rows.find((m) => m.id === id) ?? null;
}
