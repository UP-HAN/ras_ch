/**
 * 게시글 직렬화 — 허용목록(allowlist) 방식 (APR-02c/02d, 3.1, 절대 규칙 3·4)
 *
 * 세 함수 모두 "필드를 골라 담는다". 행에 컬럼이 늘어도 자동으로 새어 나가지 않는다.
 *  - toReviewerPostView : 작성자 식별 필드(user_id, name, display_name, class_id, student_no, tier) 전부 없음
 *  - toStudentPostView  : display_name·반 이름만. 실명(name) 없음
 *  - toTeacherPostView  : 실명·검토 이력 포함
 */
import type {
  ArticleDetailView,
  ImageView,
  ReportDetailView,
  ReviewerPostView,
  StudentPostView,
  TeacherPostView,
} from '../../types/api.js';
import type {
  ArticleDetailsRow,
  ClassRow,
  PostImageRow,
  PostRow,
  ReportDetailsRow,
  UserRow,
} from '../../types/db.js';

export interface PostBundle {
  post: PostRow;
  author: Pick<
    UserRow,
    | 'id'
    | 'name'
    | 'display_name'
    | 'class_id'
    | 'student_no'
    | 'tier'
    | 'is_reporter'
    | 'parent_consent'
  >;
  authorClass: Pick<ClassRow, 'id' | 'name' | 'grade'>;
  images: PostImageRow[];
  report: ReportDetailsRow | null;
  article: ArticleDetailsRow | null;
}

/** 업로드 파일 경로 → 공개 URL. 파일 시스템 경로는 응답에 내보내지 않는다 */
export function imageUrl(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  return `/uploads/${file}`;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function toImageViews(images: PostImageRow[]): ImageView[] {
  return [...images]
    .sort((a, b) => a.sort - b.sort)
    .map((img) => ({
      id: img.id,
      kind: img.kind,
      url: imageUrl(img.path),
      width: img.width,
      height: img.height,
    }));
}

function toReportView(r: ReportDetailsRow | null): ReportDetailView | null {
  if (!r) return null;
  return {
    avgMinutesPerDay: r.avg_minutes_per_day,
    topCategory: r.top_category,
    topApp: r.top_app,
    prevAvgMinutes: r.prev_avg_minutes,
    diffMinutes: r.diff_minutes,
    goalAchieved: r.goal_achieved === null ? null : r.goal_achieved === 1,
    goalReason: r.goal_reason,
  };
}

function toArticleView(a: ArticleDetailsRow | null): ArticleDetailView | null {
  if (!a) return null;
  return { articleType: a.article_type, tags: [...a.tags], oneLine: a.one_line };
}

export function toReviewerPostView(b: PostBundle): ReviewerPostView {
  const { post } = b;
  return {
    id: post.id,
    type: post.type,
    status: post.status,
    authorGrade: post.grade,
    title: post.title,
    body: post.body,
    goalText: post.goal_text,
    weekKey: post.week_key,
    submittedAt: iso(post.submitted_at),
    images: toImageViews(b.images),
    report: toReportView(b.report),
    article: toArticleView(b.article),
  };
}

export function toStudentPostView(b: PostBundle, viewerId: number): StudentPostView {
  const { post, author, authorClass } = b;
  return {
    id: post.id,
    type: post.type,
    status: post.status,
    visibility: post.visibility,
    title: post.title,
    body: post.body,
    goalText: post.goal_text,
    weekKey: post.week_key,
    approvedAt: iso(post.approved_at),
    createdAt: post.created_at.toISOString(),
    likeCount: post.like_count,
    commentCount: post.comment_count,
    isMine: post.author_id === viewerId,
    author: {
      displayName: author.display_name,
      className: authorClass.name,
      grade: authorClass.grade,
      tier: author.tier,
      isReporter: author.is_reporter === 1,
    },
    images: toImageViews(b.images),
    report: toReportView(b.report),
    article: toArticleView(b.article),
  };
}

export function toTeacherPostView(b: PostBundle): TeacherPostView {
  const { post, author, authorClass } = b;
  const report = toReportView(b.report);
  const article = toArticleView(b.article);
  return {
    id: post.id,
    type: post.type,
    status: post.status,
    visibility: post.visibility,
    title: post.title,
    body: post.body,
    goalText: post.goal_text,
    weekKey: post.week_key,
    submittedAt: iso(post.submitted_at),
    approvedAt: iso(post.approved_at),
    createdAt: post.created_at.toISOString(),
    updatedAt: post.updated_at.toISOString(),
    likeCount: post.like_count,
    commentCount: post.comment_count,
    author: {
      id: author.id,
      name: author.name,
      displayName: author.display_name,
      classId: authorClass.id,
      className: authorClass.name,
      grade: authorClass.grade,
      studentNo: author.student_no,
      tier: author.tier,
      isReporter: author.is_reporter === 1,
      parentConsent: author.parent_consent,
    },
    images: toImageViews(b.images),
    report: report && b.report ? { ...report, teacherScore: b.report.teacher_score } : null,
    article: article && b.article ? { ...article, isFeatured: b.article.is_featured === 1 } : null,
    councilReview: {
      reviewerId: post.council_reviewer_id,
      reviewedAt: iso(post.council_reviewed_at),
      result: post.council_result,
      checklist: post.council_checklist,
      note: post.council_note,
    },
    reviewedBy: post.reviewed_by,
    reviewedAt: iso(post.reviewed_at),
    rejectReason: post.reject_reason,
    hiddenReason: post.hidden_reason,
    deletedAt: iso(post.deleted_at),
  };
}

/** 응답 객체 어디에도 작성자 식별 키가 없는지 검사(테스트·감사용) */
export const AUTHOR_IDENTIFYING_KEYS = [
  'user_id',
  'userId',
  'author_id',
  'authorId',
  'author',
  'name',
  'display_name',
  'displayName',
  'class_id',
  'classId',
  'className',
  'student_no',
  'studentNo',
  'tier',
  'login_id',
  'loginId',
] as const;

export function findIdentifyingKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findIdentifyingKeys(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const here = path ? `${path}.${k}` : k;
      const hit = (AUTHOR_IDENTIFYING_KEYS as readonly string[]).includes(k) ? [here] : [];
      return [...hit, ...findIdentifyingKeys(v, here)];
    });
  }
  return [];
}
