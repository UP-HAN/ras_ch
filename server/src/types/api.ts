/**
 * 역할별 API 응답 타입. client 는 `import type` 으로만 참조한다.
 *
 *  - ReviewerPostView : 학생 검토자(익명 검토, APR-02c). 작성자 식별 정보 없음. "○학년 학생"만.
 *  - StudentPostView  : 일반 학생. display_name(마스킹)과 반 이름만. 실명 없음 (3.1, 절대 규칙 4).
 *  - TeacherPostView  : 교사·관리자. 실명·검토 이력 포함.
 *
 * 세 타입은 lib/serializers/post.ts 의 허용목록 직렬화 함수로만 만든다.
 */
import type {
  ArticleType,
  CouncilResult,
  ImageKind,
  PostStatus,
  PostType,
  Role,
  Tier,
  Visibility,
  YesNo,
} from './db.js';

export interface ImageView {
  id: number;
  kind: ImageKind;
  url: string;
  width: number;
  height: number;
}

export interface ReportDetailView {
  avgMinutesPerDay: number | null;
  topCategory: string | null;
  topApp: string | null;
  prevAvgMinutes: number | null;
  diffMinutes: number | null;
  goalAchieved: boolean | null;
  goalReason: string | null;
}

export interface ArticleDetailView {
  articleType: ArticleType;
  tags: string[];
  oneLine: string | null;
}

/** 검토자용: 작성자 관련 필드가 아예 없다 */
export interface ReviewerPostView {
  id: number;
  type: PostType;
  status: PostStatus;
  /** "○학년 학생" 표시용 */
  authorGrade: number;
  title: string | null;
  body: string;
  goalText: string | null;
  weekKey: string | null;
  submittedAt: string | null;
  images: ImageView[];
  report: ReportDetailView | null;
  article: ArticleDetailView | null;
}

export interface StudentAuthorView {
  displayName: string;
  className: string;
  grade: number;
  tier: Tier;
  isReporter: boolean;
}

/** 일반 학생용 */
export interface StudentPostView {
  id: number;
  type: PostType;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  body: string;
  goalText: string | null;
  weekKey: string | null;
  approvedAt: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isMine: boolean;
  author: StudentAuthorView;
  images: ImageView[];
  report: ReportDetailView | null;
  article: ArticleDetailView | null;
}

export interface TeacherAuthorView extends StudentAuthorView {
  id: number;
  name: string;
  classId: number;
  studentNo: number | null;
  parentConsent: YesNo;
}

/** 교사·관리자용 */
export interface TeacherPostView {
  id: number;
  type: PostType;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  body: string;
  goalText: string | null;
  weekKey: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  author: TeacherAuthorView;
  images: ImageView[];
  report: (ReportDetailView & { teacherScore: number | null }) | null;
  article: (ArticleDetailView & { isFeatured: boolean }) | null;
  councilReview: {
    reviewerId: number | null;
    reviewedAt: string | null;
    result: CouncilResult | null;
    checklist: Record<string, boolean> | null;
    note: string | null;
  };
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  hiddenReason: string | null;
  deletedAt: string | null;
}

/** 학생 화면에 보이는 사용자(실명 없음) */
export interface PublicUser {
  id: number;
  displayName: string;
  grade: number | null;
  className: string | null;
  tier: Tier;
  isReporter: boolean;
  isCouncil: boolean;
}

/** 교사 화면용 사용자(실명 포함) */
export interface TeacherUser extends PublicUser {
  loginId: string;
  name: string;
  role: Role;
  classId: number | null;
  studentNo: number | null;
  parentConsent: YesNo;
  status: string;
  isApprover: boolean;
  advisorGradeGroup: string | null;
  mustChangePw: boolean;
  lastLoginAt: string | null;
}

/** GET /me 의 본인 정보(본인에게는 실명을 보여 줘도 된다) */
export interface MeView extends PublicUser {
  loginId: string;
  name: string;
  role: Role;
  isApprover: boolean;
  advisorGradeGroup: string | null;
  mustChangePw: boolean;
  parentConsent: YesNo;
  actingAs: 'teacher' | 'council' | null;
  /** APR-12 연결된 자치회 검토 계정이 있는 교사 */
  hasCouncilAccount: boolean;
}

// ---------- S1: 인증·홈·관리 ----------

export interface LoginResult {
  me: MeView;
  mustChangePw: boolean;
}

export interface NotificationView {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** 학생 홈 (6.1, CMN-05). 리포트 상태는 S2 전까지 'none' */
export interface HomeView {
  me: MeView;
  weekKey: string;
  weekPoints: number;
  report: { status: 'none' | PostStatus; postId: number | null };
  notifications: NotificationView[];
}

export interface SchoolYearView {
  id: number;
  year: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface ClassView {
  id: number;
  grade: number;
  classNo: number;
  name: string;
  homeroomTeacherId: number | null;
  homeroomTeacherName: string | null;
  teacherIds: number[];
  studentCount: number;
}

export interface TeacherView extends TeacherUser {
  classIds: number[];
  hasCouncilAccount: boolean;
}

export interface ImportRowError {
  line: number;
  message: string;
}

export interface ImportRowResult {
  line: number;
  loginId: string;
  className: string;
  studentNo: number;
  action: 'create' | 'update';
  /** 자동 생성된 초기 비밀번호(신규·미변경 학생만, 결과 화면에 1회 표시) */
  initialPassword: string | null;
}

export interface ImportResult {
  dryRun: boolean;
  created: number;
  updated: number;
  createdClasses: string[];
  rows: ImportRowResult[];
  errors: ImportRowError[];
}

export interface ResetPasswordResult {
  tempPassword: string;
}

// ---------- S2: 리포트 ----------

export type RejectReasonCode = 'capture_mismatch' | 'too_short' | 'inappropriate' | 'other';

/** 작성 화면에 필요한 맥락 (RPT-01 주차, RPT-03 지난주 목표, AUTH-08 유형) */
export interface WeekContextView {
  currentWeekKey: string;
  previousWeekKey: string;
  defaultWeekKey: string;
  /** 주차별로 이미 쓴 글이 있으면 그 id */
  existing: Record<string, { postId: number; status: PostStatus } | null>;
  canUseCapture: boolean;
  prevGoalText: string | null;
  prevAvgMinutes: number | null;
  topCategories: string[];
  limits: {
    bodyMin: number;
    bodyMax: number;
    goalMax: number;
    goalReasonMax: number;
    topAppMax: number;
  };
}

/** 본인 글 상세: 학생 뷰 + 반려 사유·지난주 목표 */
export interface MyPostView extends StudentPostView {
  rejectReason: string | null;
  hiddenReason: string | null;
  submittedAt: string | null;
  prevGoalText: string | null;
}

export interface PostListPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CaptureGuideView {
  android_samsung: string;
  iphone: string;
  warning: string;
}

export interface PendingQueueView {
  classId: number;
  approvalMode: 'two_step' | 'teacher_only';
  /** APR-07 자동 승격 기준 시간 */
  autoEscalateHours: number;
  /** pending 상태로 autoEscalateHours 를 넘긴 글 id (APR-07) */
  escalatedIds: number[];
  counts: PendingCounts;
  items: TeacherPostView[];
}

export interface BulkApproveResult {
  approved: number[];
  failed: Array<{ id: number; message: string }>;
}

export interface PublicSettingsView {
  captureGuide: CaptureGuideView;
  reportText: { reflection_min: number; reflection_max: number; goal_max: number };
  goodCommentGuide: string;
}

// ---------- S3: 기사·반응·출석·읽기·댓글 점검 ----------

export interface CommentView {
  id: number;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
  author: StudentAuthorView;
}

export interface TeacherCommentView {
  id: number;
  body: string;
  status: 'visible' | 'hidden' | 'deleted';
  likeCount: number;
  reportCount: number;
  bannedHits: string[];
  createdAt: string;
  hiddenReason: string | null;
  author: {
    id: number;
    name: string;
    displayName: string;
    classId: number | null;
    className: string | null;
    grade: number | null;
    studentNo: number | null;
  };
  target: {
    type: string;
    id: number;
    postType: string | null;
    title: string | null;
    authorDisplayName: string | null;
  };
}

export interface TeacherCommentsPage {
  scope: 'class' | 'grade' | 'group';
  scopeId: string;
  items: TeacherCommentView[];
  nextCursor: string | null;
  counts: {
    today: number;
    unchecked: number;
    lastCheckedAt: string | null;
    lastCheckedBy: string | null;
  };
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

export interface ReportResult {
  reported: boolean;
  autoHidden: boolean;
}

export interface AttendanceView {
  days: number;
  streak: number;
  todayDone: boolean;
}

export interface ReadResult {
  completed: boolean;
  reason?: 'TOO_FAST' | 'NOT_SCROLLED' | 'ALREADY_DONE' | 'NOT_ELIGIBLE';
}

export interface ReportItemView {
  id: number;
  targetType: string;
  targetId: number;
  postId: number | null;
  reason: string;
  status: 'open' | 'kept' | 'hidden' | 'deleted';
  createdAt: string;
  reportCount: number;
  reporter: { displayName: string; className: string | null };
  target: {
    preview: string | null;
    status: string | null;
    authorName: string | null;
    className: string | null;
  };
}

export interface BannedWordView {
  id: number;
  word: string;
  isActive: boolean;
}

/** 상세 화면에서 좋아요·댓글 상태를 함께 내려준다 */
export interface PostReactionsView {
  likedByMe: boolean;
  likeCount: number;
  comments: CommentView[];
  myCommentCount: number;
  goodCommentGuide: string;
}

// ---------- S4: 포인트·2단계 승인 ----------

export interface LedgerItemView {
  id: number;
  ruleCode: string;
  ruleName: string;
  amount: number;
  isReversal: boolean;
  note: string | null;
  refType: string | null;
  refId: number | null;
  grantedByName: string | null;
  dayKey: string;
  weekKey: string;
  createdAt: string;
}

export interface PointsSummaryView {
  weekKey: string;
  monthKey: string;
  week: number;
  month: number;
  all: number;
  range: 'week' | 'month' | 'all';
  items: LedgerItemView[];
}

export interface BonusResult {
  granted: number;
  remainingStudentWeek: number;
  remainingTeacherWeek: number;
}

export interface PointCapView {
  scope: 'day' | 'week' | 'month' | 'per_object' | 'streak';
  unit: 'count' | 'points';
  max: number;
  share_codes?: string[];
  by?: 'user' | 'granter';
}

export interface PointRuleView {
  code: string;
  name: string;
  amount: number;
  amountMin: number | null;
  amountMax: number | null;
  caps: PointCapView[];
  isActive: boolean;
  version: number;
  description: string | null;
}

export interface ApprovalSettingView {
  scope: 'school' | 'grade' | 'class';
  scopeId: number | null;
  label: string;
  mode: 'two_step' | 'teacher_only';
  autoEscalateHours: number;
  autoApproveTeacherReview: boolean;
}

export interface ReviewAssignmentView {
  id: number;
  reviewerUserId: number;
  reviewerKind: 'student' | 'teacher';
  reviewerName: string;
  reviewerDisplayName: string;
  reviewerClass: string | null;
  grades: number[];
  postTypes: string[];
  allowedResults: 'pass_only' | 'pass_hold';
  dailyCap: number;
  preset: 'assist' | 'basic' | 'senior' | 'custom';
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}

export interface ReviewerCandidateView {
  id: number;
  name: string;
  displayName: string;
  role: string;
  className: string | null;
  grade: number | null;
  title: string | null;
}

/** 익명 검토 큐 항목 (APR-02c): 작성자 식별 없음 */
export interface ReviewQueueItem extends ReviewerPostView {
  checklist: Array<{ code: string; label: string }>;
}

export interface ReviewSummaryView {
  hasAssignment: boolean;
  pending: number;
  doneToday: number;
  dailyCap: number;
  allowedResults: 'pass_only' | 'pass_hold' | null;
  grades: number[];
  postTypes: string[];
  guide: string;
  holdReasons: Array<{ code: string; text: string }>;
}

export interface ReviewLogView {
  id: number;
  action: string;
  actorRole: string;
  actorName: string | null;
  checklist: Record<string, boolean> | null;
  note: string | null;
  createdAt: string;
}

export interface PendingCounts {
  reviewed: number;
  flagged: number;
  pending: number;
  escalated: number;
}
