/**
 * DB 행 타입 (server/migrations/001_init.sql 과 1:1). 컬럼명은 snake_case 그대로.
 * 응답으로 내보낼 때는 반드시 lib/serializers 를 거친다 (실명·식별 정보 통제).
 */
export type Role = 'student' | 'teacher' | 'admin' | 'council_teacher';
export type UserStatus = 'active' | 'transferred' | 'graduated' | 'disabled';
export type Tier = 'seed' | 'sprout' | 'flower' | 'fruit' | 'star';
export type YesNo = 'Y' | 'N';
export type GradeGroup = '3-4' | '5-6';

export type PostType = 'report' | 'diary' | 'article';
export type PostStatus =
  'draft' | 'pending' | 'reviewed' | 'flagged' | 'approved' | 'rejected' | 'hidden';
export type Visibility = 'class' | 'school';
export type CouncilResult = 'pass' | 'hold';
export type ArticleType = 'coverage' | 'interview' | 'review' | 'cardnews';
export type ImageKind = 'category_capture' | 'app_capture' | 'photo';

/** 댓글·좋아요·신고·읽기 파이프라인의 대상 (2·3차: news_topic, council_post, agenda_item 추가) */
export type TargetType = 'post' | 'comment';

export interface SchoolYearRow {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  is_current: 0 | 1;
}

export interface ClassRow {
  id: number;
  school_year_id: number;
  grade: number;
  class_no: number;
  name: string;
  homeroom_teacher_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserRow {
  id: number;
  login_id: string;
  password_hash: string;
  role: Role;
  is_approver: 0 | 1;
  advisor_grade_group: GradeGroup | null;
  name: string;
  display_name: string;
  class_id: number | null;
  student_no: number | null;
  parent_consent: YesNo;
  consent_updated_at: Date | null;
  is_reporter: 0 | 1;
  tier: Tier;
  linked_council_account_id: number | null;
  status: UserStatus;
  must_change_pw: 0 | 1;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CouncilMemberRow {
  id: number;
  user_id: number;
  title: string;
  term_start: string;
  term_end: string | null;
  is_active: 0 | 1;
}

export interface PostRow {
  id: number;
  type: PostType;
  author_id: number;
  class_id: number;
  grade: number;
  status: PostStatus;
  visibility: Visibility;
  title: string | null;
  body: string;
  goal_text: string | null;
  week_key: string | null;
  report_week_key: string | null;
  submitted_at: Date | null;
  council_reviewer_id: number | null;
  council_reviewed_at: Date | null;
  council_result: CouncilResult | null;
  council_checklist: Record<string, boolean> | null;
  council_note: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  reject_reason: string | null;
  approved_at: Date | null;
  hidden_reason: string | null;
  like_count: number;
  comment_count: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportDetailsRow {
  post_id: number;
  avg_minutes_per_day: number | null;
  top_category: string | null;
  top_app: string | null;
  prev_avg_minutes: number | null;
  diff_minutes: number | null;
  goal_achieved: 0 | 1 | null;
  goal_reason: string | null;
  teacher_score: number | null;
}

export interface ArticleDetailsRow {
  post_id: number;
  article_type: ArticleType;
  tags: string[];
  one_line: string | null;
  is_featured: 0 | 1;
}

export interface PostImageRow {
  id: number;
  post_id: number;
  kind: ImageKind;
  path: string;
  width: number;
  height: number;
  sort: number;
  delete_after: string | null;
}

export interface CommentRow {
  id: number;
  target_type: TargetType | string;
  target_id: number;
  author_id: number;
  body: string;
  status: 'visible' | 'hidden';
  hidden_by: number | null;
  hidden_reason: string | null;
  like_count: number;
  created_at: Date;
  updated_at: Date;
}

export type CapScope = 'day' | 'week' | 'month' | 'per_object' | 'streak';
export type CapUnit = 'count' | 'points';

/** point_rules.caps JSON 원소 */
export interface PointCap {
  scope: CapScope;
  unit: CapUnit;
  max: number;
  /** 다른 규칙 코드와 합산해서 상한을 센다 (예: COMMENT_WRITTEN + NEWS_OPINION) */
  share_codes?: string[];
  /** 'granter'면 지급자(교사) 기준으로 센다 (TEACHER_BONUS 교사당 주 300) */
  by?: 'user' | 'granter';
}

export interface PointRuleRow {
  id: number;
  code: string;
  name: string;
  amount: number;
  amount_min: number | null;
  amount_max: number | null;
  caps: PointCap[];
  is_active: 0 | 1;
  version: number;
  description: string | null;
  sort: number;
}

export interface LedgerRow {
  id: number;
  user_id: number;
  rule_code: string;
  rule_version: number;
  amount: number;
  ref_type: string | null;
  ref_id: number | null;
  day_key: string;
  week_key: string;
  month_key: string;
  note: string | null;
  granted_by: number | null;
  reversal_of: number | null;
  event_key: string | null;
  created_at: Date;
}

export interface SettingRow {
  key: string;
  value: unknown;
  updated_by: number | null;
  updated_at: Date;
}
