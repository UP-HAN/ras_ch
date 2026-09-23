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
}
