/**
 * 1차 검토 규칙 (APR-02, 02c, 03, 04) — 순수 함수·상수
 */
export interface ChecklistItem {
  code: string;
  label: string;
}

/** APR-03 체크리스트. 코드로 저장(council_checklist JSON) */
export const CHECKLISTS: Record<'report' | 'article', ChecklistItem[]> = {
  report: [
    { code: 'captures_match', label: '캡처 2장이 사용시간·앱 순위 화면이 맞아요' },
    { code: 'body_length', label: '성찰 글이 100자 이상이에요' },
    { code: 'goal_present', label: '다음 주 목표가 한 줄 있어요' },
    { code: 'clean', label: '나쁜 말·개인정보가 없어요' },
    { code: 'polite', label: '존댓말로 썼어요 (사이트 원칙)' },
  ],
  article: [
    { code: 'title_tags_body', label: '제목·영역·본문(200자)이 있어요' },
    { code: 'photos_ok', label: '사진이 기사와 관련 있고 개인정보가 없어요' },
    { code: 'clean', label: '나쁜 말·부적절한 내용이 없어요' },
    { code: 'polite', label: '존댓말로 썼어요 (사이트 원칙)' },
  ],
};

/** 보류 요청 사유 프리셋 (APR-02d "개인정보 보임" 포함). 선택 후 20자 이상으로 다듬어 보낸다 */
export const HOLD_REASONS = [
  { code: 'privacy', text: '캡처에 이름이나 개인정보가 보여요. 다시 캡처해 주세요.' },
  {
    code: 'capture',
    text: '캡처가 안내한 화면과 달라요. 사용시간 화면과 앱 순위 화면을 올려 주세요.',
  },
  { code: 'short', text: '성찰 글이 너무 짧아요. 100자 이상으로 자세히 써 주세요.' },
  { code: 'inappropriate', text: '나쁜 말이나 어울리지 않는 내용이 있어요. 고쳐 주세요.' },
  { code: 'polite', text: '반말로 쓴 문장이 있어요. 존댓말(~했어요, ~입니다)로 고쳐 주세요.' },
] as const;

export const HOLD_NOTE_MIN = 20;

export function holdNoteValid(note: string | undefined): boolean {
  return Array.from((note ?? '').trim()).length >= HOLD_NOTE_MIN;
}

export interface ReviewerContext {
  /** 검토자 user id */
  id: number;
  kind: 'student' | 'teacher';
  /** 학생 검토자의 반 (같은 반 제외) */
  classId: number | null;
  grades: number[];
  postTypes: string[]; // 'report' | 'article'
}

export interface ReviewablePost {
  author_id: number;
  class_id: number;
  grade: number;
  type: 'report' | 'diary' | 'article';
  status: string;
}

/** assignment 의 글 유형 → posts.type 목록 (report 에는 일기형 포함) */
export function expandPostTypes(types: string[]): Array<'report' | 'diary' | 'article'> {
  const out: Array<'report' | 'diary' | 'article'> = [];
  if (types.includes('report')) out.push('report', 'diary');
  if (types.includes('article')) out.push('article');
  return out;
}

/**
 * 검토자가 이 글을 볼 수 있는가 (큐 조건과 동일).
 * 학생 검토자: 본인 글·같은 반 글 제외(APR-02). 교사 검토 계정: 본인 반 제외 규칙 없음(APR-12)
 */
export function reviewQueueFilter(
  reviewer: ReviewerContext,
  post: ReviewablePost,
  classMode: 'two_step' | 'teacher_only',
): boolean {
  if (post.status !== 'pending') return false;
  if (classMode === 'teacher_only') return false; // APR-06
  if (!reviewer.grades.includes(post.grade)) return false;
  if (!expandPostTypes(reviewer.postTypes).includes(post.type)) return false;
  if (reviewer.kind === 'student') {
    if (post.author_id === reviewer.id) return false;
    if (reviewer.classId !== null && post.class_id === reviewer.classId) return false;
  }
  return true;
}

/** 검토 결과가 assignment 의 허용 범위 안인가 (APR-02a) */
export function resultAllowed(
  allowed: 'pass_only' | 'pass_hold',
  result: 'pass' | 'hold',
): boolean {
  return result === 'pass' || allowed === 'pass_hold';
}

/** 검토 안내 문구 (APR-10) 기본값. settings.review_guide 가 있으면 그것을 쓴다 */
export const REVIEW_GUIDE_DEFAULT =
  '체크리스트 항목만 확인해요. 친구 글을 평가하는 게 아니에요. 판단이 어려우면 "보류 요청"을 눌러요. 누가 썼는지는 알 수 없고, 알려고 하지도 않아요.';
