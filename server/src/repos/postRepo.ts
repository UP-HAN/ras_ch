/**
 * posts / report_details / post_images 저장소 (SQL 직접).
 * 목록·상세는 PostBundle(게시글 + 작성자 + 반 + 이미지 + 상세)로 돌려주고, 응답은 serializers 가 만든다.
 */
import type { PoolConnection } from 'mysql2/promise';
import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { PostBundle } from '../lib/serializers/post.js';
import type {
  ArticleDetailsRow,
  ClassRow,
  CouncilResult,
  ImageKind,
  PostImageRow,
  PostRow,
  PostStatus,
  PostType,
  ReportDetailsRow,
  UserRow,
  Visibility,
} from '../types/db.js';

export async function findPostById(
  id: number,
  conn: Executor = getPool(),
  forUpdate = false,
): Promise<PostRow | null> {
  return queryOne<PostRow>(
    `SELECT * FROM posts WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
    conn,
  );
}

export async function findReportByAuthorWeek(
  authorId: number,
  weekKey: string,
  conn: Executor = getPool(),
): Promise<PostRow | null> {
  return queryOne<PostRow>(
    "SELECT * FROM posts WHERE author_id = ? AND type IN ('report','diary') AND week_key = ? LIMIT 1",
    [authorId, weekKey],
    conn,
  );
}

export interface PrevWeekSnapshot {
  post_id: number;
  avg_minutes_per_day: number | null;
  goal_text: string | null;
}

/** 지난주 리포트(반려·삭제 제외) 수치·목표 (RPT-03, RPT-08) */
export async function findPrevWeekReport(
  authorId: number,
  prevWeekKey: string,
  conn: Executor = getPool(),
): Promise<PrevWeekSnapshot | null> {
  return queryOne<PrevWeekSnapshot>(
    `SELECT p.id AS post_id, rd.avg_minutes_per_day, p.goal_text
     FROM posts p LEFT JOIN report_details rd ON rd.post_id = p.id
     WHERE p.author_id = ? AND p.type IN ('report','diary') AND p.week_key = ?
       AND p.deleted_at IS NULL AND p.status NOT IN ('rejected','hidden') LIMIT 1`,
    [authorId, prevWeekKey],
    conn,
  );
}

export interface NewPost {
  type: PostType;
  authorId: number;
  classId: number;
  grade: number;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  body: string;
  goalText: string | null;
  weekKey: string | null;
  submitted: boolean;
}

export async function insertPost(p: NewPost, conn: PoolConnection): Promise<number> {
  return insert(
    `INSERT INTO posts (type, author_id, class_id, grade, status, visibility, title, body, goal_text, week_key, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${p.submitted ? 'NOW(3)' : 'NULL'})`,
    [
      p.type,
      p.authorId,
      p.classId,
      p.grade,
      p.status,
      p.visibility,
      p.title,
      p.body,
      p.goalText,
      p.weekKey,
    ],
    conn,
  );
}

export interface ReportDetailsInput {
  avgMinutesPerDay: number | null;
  topCategory: string | null;
  topApp: string | null;
  prevAvgMinutes: number | null;
  diffMinutes: number | null;
  goalAchieved: boolean | null;
  goalReason: string | null;
}

export async function upsertReportDetails(
  postId: number,
  d: ReportDetailsInput,
  conn: PoolConnection,
): Promise<void> {
  await execute(
    `INSERT INTO report_details (post_id, avg_minutes_per_day, top_category, top_app, prev_avg_minutes, diff_minutes, goal_achieved, goal_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE avg_minutes_per_day = VALUES(avg_minutes_per_day), top_category = VALUES(top_category),
       top_app = VALUES(top_app), prev_avg_minutes = VALUES(prev_avg_minutes), diff_minutes = VALUES(diff_minutes),
       goal_achieved = VALUES(goal_achieved), goal_reason = VALUES(goal_reason)`,
    [
      postId,
      d.avgMinutesPerDay,
      d.topCategory,
      d.topApp,
      d.prevAvgMinutes,
      d.diffMinutes,
      d.goalAchieved === null ? null : d.goalAchieved ? 1 : 0,
      d.goalReason,
    ],
    conn,
  );
}

/** 본문·목표·공개 범위 등 게시글 필드 갱신 */
export interface PostPatch {
  status?: PostStatus;
  visibility?: Visibility;
  title?: string | null;
  body?: string;
  goalText?: string | null;
  submittedNow?: boolean;
  approvedNow?: boolean;
  reviewedBy?: number | null;
  reviewedNow?: boolean;
  rejectReason?: string | null;
  hiddenReason?: string | null;
  resetCouncilReview?: boolean;
  deletedNow?: boolean;
  /** S4 1차 검토 결과 (APR-03, 04) */
  councilReviewerId?: number | null;
  councilResult?: CouncilResult | null;
  councilChecklist?: Record<string, boolean> | null;
  councilNote?: string | null;
  councilReviewedNow?: boolean;
}

export async function updatePost(
  id: number,
  patch: PostPatch,
  conn: Executor = getPool(),
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (sql: string, v?: unknown) => {
    sets.push(sql);
    if (v !== undefined) params.push(v);
  };
  if (patch.status !== undefined) set('status = ?', patch.status);
  if (patch.visibility !== undefined) set('visibility = ?', patch.visibility);
  if (patch.title !== undefined) set('title = ?', patch.title);
  if (patch.body !== undefined) set('body = ?', patch.body);
  if (patch.goalText !== undefined) set('goal_text = ?', patch.goalText);
  if (patch.submittedNow) set('submitted_at = NOW(3)');
  if (patch.approvedNow) set('approved_at = NOW(3)');
  if (patch.reviewedBy !== undefined) set('reviewed_by = ?', patch.reviewedBy);
  if (patch.reviewedNow) set('reviewed_at = NOW(3)');
  if (patch.rejectReason !== undefined) set('reject_reason = ?', patch.rejectReason);
  if (patch.hiddenReason !== undefined) set('hidden_reason = ?', patch.hiddenReason);
  if (patch.resetCouncilReview) {
    set('council_reviewer_id = NULL');
    set('council_reviewed_at = NULL');
    set('council_result = NULL');
    set('council_checklist = NULL');
    set('council_note = NULL');
    set('escalated_at = NULL');
  }
  if (patch.councilReviewerId !== undefined)
    set('council_reviewer_id = ?', patch.councilReviewerId);
  if (patch.councilResult !== undefined) set('council_result = ?', patch.councilResult);
  if (patch.councilChecklist !== undefined)
    set(
      'council_checklist = ?',
      patch.councilChecklist ? JSON.stringify(patch.councilChecklist) : null,
    );
  if (patch.councilNote !== undefined) set('council_note = ?', patch.councilNote);
  if (patch.councilReviewedNow) set('council_reviewed_at = NOW(3)');
  if (patch.deletedNow) set('deleted_at = NOW(3)');
  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, params, conn);
}

export async function insertImage(
  postId: number,
  kind: ImageKind,
  path: string,
  width: number,
  height: number,
  sort: number,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO post_images (post_id, kind, path, width, height, sort) VALUES (?, ?, ?, ?, ?, ?)',
    [postId, kind, path, width, height, sort],
    conn,
  );
}

export async function listImages(
  postId: number,
  conn: Executor = getPool(),
): Promise<PostImageRow[]> {
  return query<PostImageRow>(
    'SELECT * FROM post_images WHERE post_id = ? ORDER BY sort',
    [postId],
    conn,
  );
}

export async function deleteImagesByKind(
  postId: number,
  kind: ImageKind,
  conn: Executor = getPool(),
): Promise<PostImageRow[]> {
  const rows = await query<PostImageRow>(
    'SELECT * FROM post_images WHERE post_id = ? AND kind = ?',
    [postId, kind],
    conn,
  );
  if (rows.length > 0)
    await execute('DELETE FROM post_images WHERE post_id = ? AND kind = ?', [postId, kind], conn);
  return rows;
}

export async function findImageByPath(
  path: string,
): Promise<(PostImageRow & { post: PostRow }) | null> {
  const img = await queryOne<PostImageRow>('SELECT * FROM post_images WHERE path = ? LIMIT 1', [
    path,
  ]);
  if (!img) return null;
  const post = await findPostById(img.post_id);
  if (!post) return null;
  return { ...img, post };
}

// ---------- 번들 ----------

type BundleRow = PostRow & {
  a_id: number;
  a_name: string;
  a_display_name: string;
  a_class_id: number | null;
  a_student_no: number | null;
  a_tier: UserRow['tier'];
  a_title_code: string | null;
  a_is_reporter: 0 | 1;
  a_parent_consent: UserRow['parent_consent'];
  c_id: number;
  c_name: string;
  c_grade: number;
};

const BUNDLE_SELECT = `
  SELECT p.*, u.id AS a_id, u.name AS a_name, u.display_name AS a_display_name, u.class_id AS a_class_id,
         u.student_no AS a_student_no, u.tier AS a_tier, u.title_code AS a_title_code, u.is_reporter AS a_is_reporter, u.parent_consent AS a_parent_consent,
         c.id AS c_id, c.name AS c_name, c.grade AS c_grade
  FROM posts p JOIN users u ON u.id = p.author_id JOIN classes c ON c.id = p.class_id`;

async function attachDetails(rows: BundleRow[], conn: Executor): Promise<PostBundle[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const images = await query<PostImageRow>(
    `SELECT * FROM post_images WHERE post_id IN (${ph}) ORDER BY sort`,
    ids,
    conn,
  );
  const reports = await query<ReportDetailsRow>(
    `SELECT * FROM report_details WHERE post_id IN (${ph})`,
    ids,
    conn,
  );
  const articles = await query<ArticleDetailsRow>(
    `SELECT * FROM article_details WHERE post_id IN (${ph})`,
    ids,
    conn,
  );
  const imgBy = new Map<number, PostImageRow[]>();
  for (const i of images) imgBy.set(i.post_id, [...(imgBy.get(i.post_id) ?? []), i]);
  const repBy = new Map(reports.map((r) => [r.post_id, r]));
  const artBy = new Map(articles.map((a) => [a.post_id, a]));

  return rows.map((r) => {
    const {
      a_id,
      a_name,
      a_display_name,
      a_class_id,
      a_student_no,
      a_tier,
      a_title_code,
      a_is_reporter,
      a_parent_consent,
      c_id,
      c_name,
      c_grade,
      ...post
    } = r;
    const klass: Pick<ClassRow, 'id' | 'name' | 'grade'> = {
      id: c_id,
      name: c_name,
      grade: c_grade,
    };
    return {
      post: post as PostRow,
      author: {
        id: a_id,
        name: a_name,
        display_name: a_display_name,
        class_id: a_class_id,
        student_no: a_student_no,
        tier: a_tier,
        title_code: a_title_code,
        is_reporter: a_is_reporter,
        parent_consent: a_parent_consent,
      },
      authorClass: klass,
      images: imgBy.get(r.id) ?? [],
      report: repBy.get(r.id) ?? null,
      article: artBy.get(r.id) ?? null,
    };
  });
}

export async function loadBundle(
  id: number,
  conn: Executor = getPool(),
): Promise<PostBundle | null> {
  const rows = await query<BundleRow>(`${BUNDLE_SELECT} WHERE p.id = ?`, [id], conn);
  return (await attachDetails(rows, conn))[0] ?? null;
}

export async function loadBundles(
  ids: number[],
  conn: Executor = getPool(),
): Promise<PostBundle[]> {
  if (ids.length === 0) return [];
  const rows = await query<BundleRow>(
    `${BUNDLE_SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')})`,
    ids,
    conn,
  );
  return attachDetails(rows, conn);
}

export interface ApprovedListQuery {
  type: PostType[];
  /** 같은 반 글 (visibility 무관) */
  classId?: number;
  /** 전교 공개 글 */
  schoolOnly?: boolean;
  /** latest: approved_at·id 내림차순 / likes: like_count·id 내림차순 (ART-04) */
  sort?: 'latest' | 'likes';
  /** 기사 영역 태그 필터 (article_details.tags JSON) */
  tag?: string;
  /** 기자단 학생 글만 (ART-07) */
  reporterOnly?: boolean;
  cursor?: { approvedAt?: string; likeCount?: number; id: number };
  limit: number;
}

/** 승인된 글 목록, 커서 페이지네이션 (CMN-04) */
export async function listApproved(q: ApprovedListQuery): Promise<PostBundle[]> {
  const where: string[] = ['p.deleted_at IS NULL', "p.status = 'approved'"];
  const params: unknown[] = [];
  where.push(`p.type IN (${q.type.map(() => '?').join(',')})`);
  params.push(...q.type);
  if (q.classId !== undefined) {
    where.push('p.class_id = ?');
    params.push(q.classId);
  }
  if (q.schoolOnly) where.push("p.visibility = 'school'");
  if (q.tag) {
    where.push(
      'p.id IN (SELECT post_id FROM article_details WHERE JSON_CONTAINS(tags, JSON_QUOTE(?)))',
    );
    params.push(q.tag);
  }
  if (q.reporterOnly) where.push('u.is_reporter = 1');
  const sort = q.sort ?? 'latest';
  if (q.cursor) {
    if (sort === 'likes') {
      where.push('(p.like_count < ? OR (p.like_count = ? AND p.id < ?))');
      params.push(q.cursor.likeCount ?? 0, q.cursor.likeCount ?? 0, q.cursor.id);
    } else {
      where.push('(p.approved_at < ? OR (p.approved_at = ? AND p.id < ?))');
      params.push(q.cursor.approvedAt, q.cursor.approvedAt, q.cursor.id);
    }
  }
  params.push(q.limit);
  const order = sort === 'likes' ? 'p.like_count DESC, p.id DESC' : 'p.approved_at DESC, p.id DESC';
  const rows = await query<BundleRow>(
    `${BUNDLE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
    params,
  );
  return attachDetails(rows, getPool());
}

// ---------- S3: 기사·댓글 수 ----------

export interface ArticleDetailsInput {
  articleType: string;
  tags: string[];
  oneLine: string | null;
}

export async function upsertArticleDetails(
  postId: number,
  d: ArticleDetailsInput,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    `INSERT INTO article_details (post_id, article_type, tags, one_line)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE article_type = VALUES(article_type), tags = VALUES(tags), one_line = VALUES(one_line)`,
    [postId, d.articleType, JSON.stringify(d.tags), d.oneLine],
    conn,
  );
}

export async function bumpCommentCount(
  postId: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<void> {
  await execute(
    'UPDATE posts SET comment_count = GREATEST(0, comment_count + ?) WHERE id = ?',
    [delta, postId],
    conn,
  );
}

/** 교사용: 반의 글을 상태별로 (대기함·반 글 목록) */
export async function listByClass(
  classId: number,
  statuses: PostStatus[],
  types: PostType[],
  limit = 200,
): Promise<PostBundle[]> {
  if (statuses.length === 0 || types.length === 0) return [];
  const rows = await query<BundleRow>(
    `${BUNDLE_SELECT} WHERE p.class_id = ? AND p.deleted_at IS NULL
       AND p.status IN (${statuses.map(() => '?').join(',')}) AND p.type IN (${types.map(() => '?').join(',')})
     ORDER BY p.submitted_at IS NULL, p.submitted_at ASC, p.id ASC LIMIT ?`,
    [classId, ...statuses, ...types, limit],
  );
  return attachDetails(rows, getPool());
}

/** 내 글 목록(학생) */
export async function listByAuthor(
  authorId: number,
  types: PostType[],
  limit = 100,
): Promise<PostBundle[]> {
  const rows = await query<BundleRow>(
    `${BUNDLE_SELECT} WHERE p.author_id = ? AND p.deleted_at IS NULL AND p.type IN (${types.map(() => '?').join(',')})
     ORDER BY p.created_at DESC LIMIT ?`,
    [authorId, ...types, limit],
  );
  return attachDetails(rows, getPool());
}
