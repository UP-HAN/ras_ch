/**
 * news_topics / news_votes / news_best_opinions / news_topic_bank 저장소 (NWS-01, 05, 06, 09)
 */
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { NewsTopicType } from '../lib/newsRules.js';

export type TopicStatus = 'candidate' | 'approved' | 'scheduled' | 'live' | 'closed' | 'rejected';
export type BankStatus = 'pending' | 'reserve' | 'ready' | 'used';
export type VoteSide = 'agree' | 'disagree';

export interface TopicRow {
  id: number;
  title: string;
  body: string;
  type: NewsTopicType;
  questions: string[];
  tags: string[];
  source_url: string | null;
  source: 'ai' | 'bank' | 'manual';
  status: TopicStatus;
  publish_at: Date | null;
  close_at: Date | null;
  approved_by: number | null;
  bank_id: number | null;
  agree_count: number;
  disagree_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface TopicInsert {
  title: string;
  body: string;
  type: NewsTopicType;
  questions: string[];
  tags: string[];
  sourceUrl: string | null;
  source: 'bank' | 'manual';
  status: 'scheduled' | 'live';
  publishAt: string;
  closeAt: string | null;
  approvedBy: number | null;
  bankId: number | null;
}

export async function findTopic(
  id: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<TopicRow | null> {
  return queryOne<TopicRow>(
    `SELECT * FROM news_topics WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
    conn,
  );
}

export async function insertTopic(t: TopicInsert, conn: Executor = getPool()): Promise<number> {
  return insert(
    `INSERT INTO news_topics (title, body, type, questions, tags, source_url, source, status, publish_at, close_at, approved_by, bank_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.title,
      t.body,
      t.type,
      JSON.stringify(t.questions),
      JSON.stringify(t.tags),
      t.sourceUrl,
      t.source,
      t.status,
      t.publishAt,
      t.closeAt,
      t.approvedBy,
      t.bankId,
    ],
    conn,
  );
}

export async function updateTopicContent(
  id: number,
  v: {
    title: string;
    body: string;
    type: NewsTopicType;
    questions: string[];
    tags: string[];
    sourceUrl: string | null;
    publishAt?: string;
  },
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    `UPDATE news_topics SET title = ?, body = ?, type = ?, questions = ?, tags = ?, source_url = ?, publish_at = COALESCE(?, publish_at) WHERE id = ?`,
    [
      v.title,
      v.body,
      v.type,
      JSON.stringify(v.questions),
      JSON.stringify(v.tags),
      v.sourceUrl,
      v.publishAt ?? null,
      id,
    ],
    conn,
  );
}

export async function setTopicStatus(
  id: number,
  status: TopicStatus,
  times: { publishAt?: string; closeAt?: string | null } = {},
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE news_topics SET status = ?, publish_at = COALESCE(?, publish_at), close_at = COALESCE(?, close_at) WHERE id = ?',
    [status, times.publishAt ?? null, times.closeAt ?? null, id],
    conn,
  );
}

export async function listLive(limit = 3): Promise<TopicRow[]> {
  return query<TopicRow>(
    "SELECT * FROM news_topics WHERE status = 'live' ORDER BY publish_at DESC, id DESC LIMIT ?",
    [limit],
  );
}

export async function listClosed(beforeId: number | null, limit: number): Promise<TopicRow[]> {
  const params: unknown[] = [];
  let where = "status = 'closed'";
  if (beforeId) {
    where += ' AND id < ?';
    params.push(beforeId);
  }
  params.push(limit);
  return query<TopicRow>(
    `SELECT * FROM news_topics WHERE ${where} ORDER BY close_at DESC, id DESC LIMIT ?`,
    params,
  );
}

/** 관리자 목록: 기간 안 게시·예약·마감·취소 (publish_at 기준) */
export async function listTopicsBetween(from: string, to: string): Promise<TopicRow[]> {
  return query<TopicRow>(
    `SELECT * FROM news_topics WHERE publish_at >= ? AND publish_at < ? ORDER BY publish_at ASC, id ASC`,
    [from, to],
  );
}

export async function listDueScheduled(
  now: string,
  conn: Executor = getPool(),
): Promise<TopicRow[]> {
  return query<TopicRow>(
    "SELECT * FROM news_topics WHERE status = 'scheduled' AND publish_at <= ? ORDER BY publish_at",
    [now],
    conn,
  );
}

export async function listExpiredLive(
  now: string,
  conn: Executor = getPool(),
): Promise<TopicRow[]> {
  return query<TopicRow>(
    "SELECT * FROM news_topics WHERE status = 'live' AND close_at IS NOT NULL AND close_at <= ?",
    [now],
    conn,
  );
}

/** 그 날짜(KST)에 게시(예정)된 주제가 있는가 — 예약 중복 방지 */
export async function countOnDate(dateKey: string, conn: Executor = getPool()): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM news_topics WHERE status IN ('scheduled','live','closed') AND DATE(publish_at) = ?",
    [dateKey],
    conn,
  );
  return Number(r?.n ?? 0);
}

export async function recountTopic(id: number, conn: Executor = getPool()): Promise<void> {
  await execute(
    `UPDATE news_topics t SET
       agree_count = (SELECT COUNT(*) FROM news_votes v WHERE v.topic_id = t.id AND v.side = 'agree'),
       disagree_count = (SELECT COUNT(*) FROM news_votes v WHERE v.topic_id = t.id AND v.side = 'disagree'),
       comment_count = (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'news_topic' AND c.target_id = t.id AND c.status = 'visible')
     WHERE t.id = ?`,
    [id],
    conn,
  );
}

export async function bumpTopicComments(
  id: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE news_topics SET comment_count = GREATEST(0, comment_count + ?) WHERE id = ?',
    [delta, id],
    conn,
  );
}

/** 마감된 주제 최근 N개 (교사 베스트 선정용) */
export async function listRecentClosed(limit = 12): Promise<TopicRow[]> {
  return query<TopicRow>(
    "SELECT * FROM news_topics WHERE status = 'closed' ORDER BY close_at DESC LIMIT ?",
    [limit],
  );
}

// ---------- 투표 ----------

export interface VoteRow {
  id: number;
  topic_id: number;
  user_id: number;
  side: VoteSide;
}

export async function findVote(
  topicId: number,
  userId: number,
  conn: Executor = getPool(),
): Promise<VoteRow | null> {
  return queryOne<VoteRow>(
    'SELECT id, topic_id, user_id, side FROM news_votes WHERE topic_id = ? AND user_id = ?',
    [topicId, userId],
    conn,
  );
}

export async function upsertVote(
  topicId: number,
  userId: number,
  side: VoteSide,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'INSERT INTO news_votes (topic_id, user_id, side) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE side = VALUES(side)',
    [topicId, userId, side],
    conn,
  );
}

export async function votesByUsers(
  topicId: number,
  userIds: number[],
): Promise<Map<number, VoteSide>> {
  if (userIds.length === 0) return new Map();
  const rows = await query<{ user_id: number; side: VoteSide }>(
    `SELECT user_id, side FROM news_votes WHERE topic_id = ? AND user_id IN (${userIds.map(() => '?').join(',')})`,
    [topicId, ...userIds],
  );
  return new Map(rows.map((r) => [r.user_id, r.side]));
}

export async function myVotes(userId: number, topicIds: number[]): Promise<Map<number, VoteSide>> {
  if (topicIds.length === 0) return new Map();
  const rows = await query<{ topic_id: number; side: VoteSide }>(
    `SELECT topic_id, side FROM news_votes WHERE user_id = ? AND topic_id IN (${topicIds.map(() => '?').join(',')})`,
    [userId, ...topicIds],
  );
  return new Map(rows.map((r) => [r.topic_id, r.side]));
}

// ---------- 베스트 의견 ----------

export interface BestRow {
  id: number;
  topic_id: number;
  comment_id: number;
  user_id: number;
  grade: number;
  selected_by: number;
}

export async function listBest(topicId: number, conn: Executor = getPool()): Promise<BestRow[]> {
  return query<BestRow>(
    'SELECT * FROM news_best_opinions WHERE topic_id = ? ORDER BY grade, id',
    [topicId],
    conn,
  );
}

export async function insertBest(
  b: { topicId: number; commentId: number; userId: number; grade: number; selectedBy: number },
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO news_best_opinions (topic_id, comment_id, user_id, grade, selected_by) VALUES (?, ?, ?, ?, ?)',
    [b.topicId, b.commentId, b.userId, b.grade, b.selectedBy],
    conn,
  );
}

export async function deleteBest(commentId: number, conn: Executor = getPool()): Promise<void> {
  await execute('DELETE FROM news_best_opinions WHERE comment_id = ?', [commentId], conn);
}

export async function bestCommentIds(topicIds: number[]): Promise<Set<number>> {
  if (topicIds.length === 0) return new Set();
  const rows = await query<{ comment_id: number }>(
    `SELECT comment_id FROM news_best_opinions WHERE topic_id IN (${topicIds.map(() => '?').join(',')})`,
    topicIds,
  );
  return new Set(rows.map((r) => r.comment_id));
}

// ---------- 주제 은행 ----------

export interface BankRow {
  id: number;
  title: string;
  body: string;
  type: NewsTopicType;
  questions: string[];
  tags: string[];
  source_url: string | null;
  proposed_by: number | null;
  reviewed_by: number | null;
  status: BankStatus;
  used_topic_id: number | null;
  sort: number;
  created_at: Date;
  proposed_by_name: string | null;
}

const BANK_SELECT =
  'SELECT b.*, u.display_name AS proposed_by_name FROM news_topic_bank b LEFT JOIN users u ON u.id = b.proposed_by';

export async function listBank(): Promise<BankRow[]> {
  return query<BankRow>(
    `${BANK_SELECT} ORDER BY FIELD(b.status, 'pending', 'ready', 'reserve', 'used'), b.sort, b.id`,
  );
}

export async function findBank(
  id: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<BankRow | null> {
  return queryOne<BankRow>(
    `${BANK_SELECT} WHERE b.id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
    conn,
  );
}

export async function insertBank(
  b: {
    title: string;
    body: string;
    type: NewsTopicType;
    questions: string[];
    tags: string[];
    sourceUrl: string | null;
    status: BankStatus;
    proposedBy: number | null;
    reviewedBy: number | null;
    sort?: number;
  },
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    `INSERT INTO news_topic_bank (title, body, type, questions, tags, source_url, status, proposed_by, reviewed_by, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.title,
      b.body,
      b.type,
      JSON.stringify(b.questions),
      JSON.stringify(b.tags),
      b.sourceUrl,
      b.status,
      b.proposedBy,
      b.reviewedBy,
      b.sort ?? 0,
    ],
    conn,
  );
}

export async function updateBank(
  id: number,
  v: {
    title: string;
    body: string;
    type: NewsTopicType;
    questions: string[];
    tags: string[];
    sourceUrl: string | null;
  },
): Promise<void> {
  await execute(
    'UPDATE news_topic_bank SET title = ?, body = ?, type = ?, questions = ?, tags = ?, source_url = ? WHERE id = ?',
    [v.title, v.body, v.type, JSON.stringify(v.questions), JSON.stringify(v.tags), v.sourceUrl, id],
  );
}

export async function setBankStatus(
  id: number,
  status: BankStatus,
  reviewedBy: number | null,
  usedTopicId: number | null = null,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE news_topic_bank SET status = ?, reviewed_by = COALESCE(?, reviewed_by), used_topic_id = COALESCE(?, used_topic_id) WHERE id = ?',
    [status, reviewedBy, usedTopicId, id],
    conn,
  );
}

export async function deleteBank(id: number): Promise<void> {
  await execute("DELETE FROM news_topic_bank WHERE id = ? AND status <> 'used'", [id]);
}

/** ready 중 가장 오래된 것(sort, id 순) */
export async function oldestReady(conn: Executor = getPool()): Promise<BankRow | null> {
  return queryOne<BankRow>(
    `${BANK_SELECT} WHERE b.status = 'ready' ORDER BY b.sort, b.id LIMIT 1 FOR UPDATE`,
    [],
    conn,
  );
}

export async function bankCounts(conn: Executor = getPool()): Promise<Record<BankStatus, number>> {
  const rows = await query<{ status: BankStatus; n: number }>(
    'SELECT status, COUNT(*) AS n FROM news_topic_bank GROUP BY status',
    [],
    conn,
  );
  const out: Record<BankStatus, number> = { pending: 0, reserve: 0, ready: 0, used: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
